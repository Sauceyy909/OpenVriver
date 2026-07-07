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

# Handle CLI arguments
ACTION="install"
if [ $# -gt 0 ]; then
    case "$1" in
        --enable)
            ACTION="enable"
            ;;
        --disable)
            ACTION="disable"
            ;;
        --install)
            ACTION="install"
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--install | --enable | --disable]"
            exit 1
            ;;
    esac
fi

STEAMVR_DIR="$HOME/.steam/steam/steamapps/common/SteamVR"
LOCAL_DRIVERS_DIR="$HOME/.local/share/openvr/drivers"

# --- DISABLE ACTION ---
if [ "$ACTION" = "disable" ]; then
    echo -e "${BOLD}${YELLOW}====================================================================${RESET}"
    echo -e "${BOLD}${YELLOW}                    Disabling OpenVriver...                         ${RESET}"
    echo -e "${BOLD}${YELLOW}====================================================================${RESET}"

    # 1. Kill daemon and Kinect tracking
    echo "Stopping any running OpenVriver daemon processes..."
    sudo killall openvriver_daemon 2>/dev/null || true
    sudo pkill -f openvriver_daemon 2>/dev/null || true

    # 2. Rename SteamVR driver directories to disable them
    if [ -d "$STEAMVR_DIR/drivers/openvriver" ]; then
        echo "Disabling native SteamVR driver..."
        sudo mv "$STEAMVR_DIR/drivers/openvriver" "$STEAMVR_DIR/drivers/openvriver.disabled"
    fi

    if [ -d "$LOCAL_DRIVERS_DIR/openvriver" ]; then
        echo "Disabling local fallback OpenVR driver..."
        mv "$LOCAL_DRIVERS_DIR/openvriver" "$LOCAL_DRIVERS_DIR/openvriver.disabled"
    fi

    # 3. Clean up udev rules
    if [ -f /etc/udev/rules.d/99-openvriver.rules ]; then
        echo "Removing udev permissions rules..."
        sudo rm -f /etc/udev/rules.d/99-openvriver.rules
        sudo udevadm control --reload-rules
        sudo udevadm trigger
    fi

    # 4. Restore steamvr.vrsettings requireHmd to true
    STEAM_CONFIG_FILE="$HOME/.steam/steam/config/steamvr.vrsettings"
    if [ -f "$STEAM_CONFIG_FILE" ]; then
        echo "Restoring SteamVR 'requireHmd' setting to true (headset required)..."
        if command -v python3 &>/dev/null; then
            python3 -c "
import json, os
path = os.path.expanduser('~/.steam/steam/config/steamvr.vrsettings')
try:
    with open(path, 'r') as f: data = json.load(f)
except Exception: data = {}
if 'steamvr' in data:
    data['steamvr']['requireHmd'] = True
    data['steamvr']['activateMultipleDrivers'] = False
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
            echo "${GREEN}Successfully restored SteamVR to original state!${RESET}"
        fi
    fi

    echo -e "\n${BOLD}${GREEN}====================================================================${RESET}"
    echo -e "${BOLD}${GREEN}             OPENVRIER AUTOPILOT DISABLED SUCCESSFULLY!             ${RESET}"
    echo -e "${BOLD}${GREEN}====================================================================${RESET}"
    echo -e "- Stopped all Kinect camera & controller daemon processes."
    echo -e "- Disabled the openvriver driver inside SteamVR."
    echo -e "- Restored SteamVR configuration to require a real headset."
    echo -e "${BOLD}${GREEN}====================================================================${RESET}"
    exit 0
fi

# --- ENABLE ACTION ---
if [ "$ACTION" = "enable" ]; then
    echo -e "${BOLD}${GREEN}====================================================================${RESET}"
    echo -e "${BOLD}${GREEN}                    Enabling OpenVriver...                          ${RESET}"
    echo -e "${BOLD}${GREEN}====================================================================${RESET}"

    DRIVER_RESTORED=false

    # 1. Rename disabled driver directories back
    if [ -d "$STEAMVR_DIR/drivers/openvriver.disabled" ]; then
        echo "Enabling native SteamVR driver..."
        sudo mv "$STEAMVR_DIR/drivers/openvriver.disabled" "$STEAMVR_DIR/drivers/openvriver"
        DRIVER_RESTORED=true
    fi

    if [ -d "$LOCAL_DRIVERS_DIR/openvriver.disabled" ]; then
        echo "Enabling local fallback OpenVR driver..."
        mv "$LOCAL_DRIVERS_DIR/openvriver.disabled" "$LOCAL_DRIVERS_DIR/openvriver"
        DRIVER_RESTORED=true
    fi

    # If neither directory exists, we need to run full install
    if [ "$DRIVER_RESTORED" = "false" ] && [ ! -d "$STEAMVR_DIR/drivers/openvriver" ] && [ ! -d "$LOCAL_DRIVERS_DIR/openvriver" ]; then
        echo "No existing installation detected. Triggering full installer..."
        ACTION="install"
    else
        # 2. Re-enable udev rules
        echo "Activating Udev permissions rules for Kinect..."
        if [ -f 99-openvriver.rules ]; then
            sudo cp 99-openvriver.rules /etc/udev/rules.d/
            sudo udevadm control --reload-rules
            sudo udevadm trigger
        fi

        # 3. Patch steamvr.vrsettings
        STEAM_CONFIG_FILE="$HOME/.steam/steam/config/steamvr.vrsettings"
        if [ -f "$STEAM_CONFIG_FILE" ]; then
            echo "Activating SteamVR 'requireHmd' to false (allow headset-free simulation)..."
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
            fi
        fi

        echo -e "\n${BOLD}${GREEN}====================================================================${RESET}"
        echo -e "${BOLD}${GREEN}             OPENVRIER AUTOPILOT ENABLED SUCCESSFULLY!              ${RESET}"
        echo -e "${BOLD}${GREEN}====================================================================${RESET}"
        echo -e "To run, start your Kinect camera & controller daemon:"
        echo -e "  ./build/openvriver_daemon"
        echo -e "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
        echo -e "${BOLD}${GREEN}====================================================================${RESET}"
        exit 0
    fi
fi

# --- INSTALL ACTION (DEFAULT) ---
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
    # Write driver manifest to register openvriver driver with SteamVR
    cat <<EOF > "$STEAMVR_DIR/drivers/openvriver/driver.vrdrivermanifest"
{
    "alwaysActivate": true,
    "name" : "openvriver",
    "directory" : "",
    "resourceOnly" : false,
    "hmd_presence" :
    [
        "*.*"
    ]
}
EOF
    echo "${GREEN}Registered driver natively inside SteamVR directory.${RESET}"
else
    echo "${YELLOW}SteamVR directory not found at default path. Registering via local OpenVR manifest...${RESET}"
    mkdir -p "$LOCAL_DRIVERS_DIR/openvriver/bin/linux64"
    mkdir -p "$LOCAL_DRIVERS_DIR/openvriver/resources/settings"
    cp build/driver_openvriver.so "$LOCAL_DRIVERS_DIR/openvriver/bin/linux64/"
    
    # Write default.vrsettings there as well
    cat <<EOF > "$LOCAL_DRIVERS_DIR/openvriver/resources/settings/default.vrsettings"
{
    "driver_openvriver": {
        "enable": true,
        "enable_virtual_hmd": true,
        "kinect_tracking_port": 8007,
        "wiimote_rotation_imu": true
    }
}
EOF
    # Write driver manifest
    cat <<EOF > "$LOCAL_DRIVERS_DIR/openvriver/driver.vrdrivermanifest"
{
    "alwaysActivate": true,
    "name" : "openvriver",
    "directory" : "",
    "resourceOnly" : false,
    "hmd_presence" :
    [
        "*.*"
    ]
}
EOF
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

# Install CLI wrapper /usr/local/bin/openvriver
if [ -f "$0" ]; then
    echo -e "\n${BOLD}${YELLOW}Creating global command 'openvriver' in /usr/local/bin/...${RESET}"
    sudo ln -sf "$(realpath "$0")" /usr/local/bin/openvriver 2>/dev/null || {
        echo "${YELLOW}Could not create symlink directly. Retrying with sudo...${RESET}"
        sudo ln -sf "$(realpath "$0")" /usr/local/bin/openvriver
    }
    echo "${GREEN}Global command 'openvriver' created successfully. You can now use 'openvriver --enable' or 'openvriver --disable' from anywhere!${RESET}"
fi

echo -e "\n${BOLD}${GREEN}====================================================================${RESET}"
echo "${BOLD}${GREEN}             OPENVRIER AUTOPILOT SETUP COMPLETE SUCCESSFULLY!      ${RESET}"
echo "${BOLD}${GREEN}====================================================================${RESET}"
echo "${BOLD}To run, start your Kinect camera & controller daemon:${RESET}"
echo "${BOLD}  ./build/openvriver_daemon${RESET}"
echo "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
echo "${BOLD}${GREEN}====================================================================${RESET}"
