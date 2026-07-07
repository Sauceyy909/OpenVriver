#!/usr/bin/env bash
# ==============================================================================
#           OpenVriver Automated Modular Setup & Registration Script
# ==============================================================================
# This script handles compilation, registers the SteamVR driver, registers 
# udev rules for all devices, and configures the Virtual HMD mode dynamically.
# Works across Ubuntu, Debian, Arch Linux, and all their sub-families.

set -euo pipefail

# Style helpers
BOLD="$(tput bold || echo '')"
GREEN="$(tput setaf 2 || echo '')"
YELLOW="$(tput setaf 3 || echo '')"
RED="$(tput setaf 1 || echo '')"
RESET="$(tput sgr0 || echo '')"

echo "${BOLD}${GREEN}====================================================================${RESET}"
echo "${BOLD}${GREEN}                 OpenVriver Complete Autopilot Installer            ${RESET}"
echo "${BOLD}${GREEN}====================================================================${RESET}"

# Step 1: Detect Distro & Install Dependencies
echo "${BOLD}${YELLOW}[Step 1/5] Detecting package manager & installing requirements...${RESET}"
if [ -f /etc/arch-release ]; then
    echo "Distro detected: Arch Linux Family."
    # Install official repository dependencies
    sudo pacman -S --needed --noconfirm cmake make gcc pkg-config bluez bluez-utils git glu
    
    # Try to find an AUR helper to install libfreenect (which is on the AUR)
    AUR_HELPER=""
    if command -v paru &>/dev/null; then
        AUR_HELPER="paru"
    elif command -v yay &>/dev/null; then
        AUR_HELPER="yay"
    fi

    if [ -n "$AUR_HELPER" ]; then
        echo "Found AUR helper: $AUR_HELPER. Installing libfreenect from AUR..."
        $AUR_HELPER -S --needed --noconfirm libfreenect
    else
        echo "No AUR helper (paru/yay) detected. Attempting manual clone & install of libfreenect from AUR..."
        TEMP_DIR=$(mktemp -d)
        pushd "$TEMP_DIR" >/dev/null
        git clone https://aur.archlinux.org/libfreenect.git
        cd libfreenect
        makepkg -si --noconfirm
        popd >/dev/null
        rm -rf "$TEMP_DIR"
    fi
elif [ -f /etc/debian_version ] || grep -q "ubuntu" /etc/os-release; then
    echo "Distro detected: Ubuntu/Debian Family."
    sudo apt update -y
    sudo apt install -y build-essential cmake pkg-config libfreenect-dev libbluetooth-dev git udev libglu1-mesa-dev
else
    echo "${BOLD}${RED}Unsupported Linux distribution! Please manually install libfreenect & bluez headers.${RESET}"
fi

# Step 2: Build Binaries & Libraries
echo -e "\n${BOLD}${YELLOW}[Step 2/5] Building OpenVriver Driver & Daemon with CMake...${RESET}"

# Ensure openvr_driver.h is present for driver compilation
mkdir -p src/driver
if [ ! -f src/driver/openvr_driver.h ]; then
    echo "Downloading openvr_driver.h from Valve's official repository..."
    curl -sSL https://raw.githubusercontent.com/ValveSoftware/openvr/master/headers/openvr_driver.h -o src/driver/openvr_driver.h
fi

mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j"$(nproc)"
cd ..

# Step 3: Register SteamVR Driver
echo -e "\n${BOLD}${YELLOW}[Step 3/5] Registering OpenVriver with SteamVR...${RESET}"
STEAMVR_DIR="$HOME/.steam/steam/steamapps/common/SteamVR"
LOCAL_DRIVERS_DIR="$HOME/.local/share/openvr/drivers"

if [ -d "$STEAMVR_DIR" ]; then
    echo "SteamVR directory detected at: $STEAMVR_DIR"
    # Copy compiled .so driver to local SteamVR driver manifest
    mkdir -p "$STEAMVR_DIR/drivers/openvriver/bin/linux64"
    mkdir -p "$STEAMVR_DIR/drivers/openvriver/resources/settings"
    cp build/driver_openvriver.so "$STEAMVR_DIR/drivers/openvriver/bin/linux64/"
    
    # Write virtual HMD configuration flag to true in the driver settings file
    cat <<EOF > "$STEAMVR_DIR/drivers/openvriver/resources/settings/default.vrsettings"
{
    "driver_openvriver": {
        "enable": true,
        "enable_virtual_hmd": true,
        "kinect_tracking_port": 8007,
        "wiimote_rotation_imu": true
    }
}
EOF
    echo "${GREEN}Registered driver natively inside SteamVR directory.${RESET}"
else
    echo "${YELLOW}SteamVR directory not found at default path. Registering via local OpenVR manifest...${RESET}"
    mkdir -p "$LOCAL_DRIVERS_DIR/openvriver/bin/linux64"
    cp build/driver_openvriver.so "$LOCAL_DRIVERS_DIR/openvriver/bin/linux64/"
    echo "${GREEN}Registered via fallback: $LOCAL_DRIVERS_DIR${RESET}"
fi

# Step 4: Setup Udev Rules
echo -e "\n${BOLD}${YELLOW}[Step 4/5] Copying & activating Udev permissions for Kinect & Bluetooth controllers...${RESET}"
sudo cp 99-openvriver.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
echo "${GREEN}Udev rules activated successfully.${RESET}"

# Step 5: Enable SteamVR No-Headset mode compatibility
echo -e "\n${BOLD}${YELLOW}[Step 5/5] Patching SteamVR vrsettings for Virtual HMD Mode...${RESET}"
STEAM_CONFIG_FILE="$HOME/.steam/steam/config/steamvr.vrsettings"
if [ -f "$STEAM_CONFIG_FILE" ]; then
    echo "Activating SteamVR 'requireHmd' to false to allow headset-free simulation..."
    # Modulate vrsettings using python or simple sed patch for "requireHmd": false and "activateMultipleDrivers": true
    if command -v python3 &>/dev/null; then
        python3 -c "
import json, os
path = os.path.expanduser('~/.steam/steam/config/steamvr.vrsettings')
try:
    with open(path, 'r') as f: data = json.load(f)
except Exception: data = {}
if 'steamvr' not in data: data['steamvr'] = {}
data['steamvr']['requireHmd'] = False
data['steamvr']['activateMultipleDrivers'] = True
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
        echo "${GREEN}Successfully configured SteamVR to run without a physical headset!${RESET}"
    else
        echo "${YELLOW}Python3 not found. Please edit $STEAM_CONFIG_FILE and set 'requireHmd': false manually.${RESET}"
    fi
else
    echo "${YELLOW}No existing steamvr.vrsettings file detected yet. SteamVR will register it on first launch.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}====================================================================${RESET}"
echo "${BOLD}${GREEN}             OPENVRIER AUTOPILOT SETUP COMPLETE SUCCESSFULLY!      ${RESET}"
echo "${BOLD}${GREEN}====================================================================${RESET}"
echo "${BOLD}To run, start your Kinect camera & controller daemon:${RESET}"
echo "${BOLD}  ./build/openvriver_daemon${RESET}"
echo "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
echo "${BOLD}${GREEN}====================================================================${RESET}"
