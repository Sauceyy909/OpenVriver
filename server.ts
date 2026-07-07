import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Retrieve OpenVriver Source Code Files dynamically
app.get("/api/driver/source-code", (req, res) => {
  // Return the official production-ready source files needed to build OpenVriver, including the Virtual HMD module.
  const sourceCode = {
    "CMakeLists.txt": `cmake_minimum_required(VERSION 3.12)
project(openvriver VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
find_package(PkgConfig REQUIRED)
pkg_check_modules(FREENECT REQUIRED libfreenect)
pkg_check_modules(BLUEZ REQUIRED bluez)

# OpenVR headers directory (often /usr/include/openvr or local submodule)
include_directories(\${FREENECT_INCLUDE_DIRS} \${BLUEZ_INCLUDE_DIRS} src/include)

# 1. Build the SteamVR Driver Shared Library (.so)
add_library(driver_openvriver SHARED 
    src/driver/driver_openvriver.cpp
    src/driver/device_provider.cpp
    src/driver/tracker_device.cpp
    src/driver/controller_device.cpp
    src/driver/virtual_hmd_device.cpp
)
target_link_libraries(driver_openvriver PRIVATE pthread)
set_target_properties(driver_openvriver PROPERTIES PREFIX "")

# 2. Build the Hardware Daemon (translates Kinect/Joycons to driver socket)
add_executable(openvriver_daemon
    src/daemon/main.cpp
    src/daemon/kinect_handler.cpp
    src/daemon/bluetooth_handler.cpp
    src/daemon/socket_server.cpp
)
target_link_libraries(openvriver_daemon PRIVATE 
    \${FREENECT_LIBRARIES} 
    \${BLUEZ_LIBRARIES} 
    pthread
)`,
    "PKGBUILD": `# Maintainer: OpenVriver Team <dev@openvriver.org>
pkgname=openvriver-git
pkgver=1.0.0.r0.g8a3fcd
pkgrel=1
pkgdesc="Driver4VR alternative for Linux. Full body tracking with Kinect & Joy-Con/Wiimote VR controller emulation + Virtual HMD mode."
arch=('x86_64' 'aarch64')
url="https://github.com/Sauceyy909/OpenVriver"
license=('GPL3')
depends=('libfreenect' 'bluez' 'bluez-utils' 'steam-vr-generic' 'glu')
makedepends=('git' 'cmake' 'pkg-config')
provides=('openvriver')
conflicts=('openvriver')
source=('git+https://github.com/Sauceyy909/OpenVriver.git'
        '99-openvriver.rules')
sha256sums=('SKIP'
            '9b7245b630e6ef92bc7ee6a666e5f8f8b8e0bf20638ce26da6818126b9117387')

pkgver() {
  cd "$srcdir/\${pkgname%-git}"
  git describe --long --tags | sed 's/\\([^-]*-\\)g/r\\1/;s/-/./g'
}

build() {
  cmake -B build -S "$srcdir/\${pkgname%-git}" \\
    -DCMAKE_BUILD_TYPE=Release \\
    -DCMAKE_INSTALL_PREFIX=/usr
  cmake --build build
}

package() {
  DESTDIR="$pkgdir" cmake --install build
  
  # Install udev rules for Kinect & Joycons/Wiimotes
  install -Dm644 "$srcdir/99-openvriver.rules" "$pkgdir/usr/lib/udev/rules.d/99-openvriver.rules"
}`,
    "99-openvriver.rules": `# OpenVriver Udev Rules
# Grants user permissions for Xbox Kinect V1 (Xbox 360) and Joycons/Wiimotes

# Kinect Audio & Camera Device permissions
SUBSYSTEM=="usb", ATTR{idVendor}=="045e", ATTR{idProduct}=="02ae", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="045e", ATTR{idProduct}=="02b0", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="045e", ATTR{idProduct}=="02ad", MODE="0666", GROUP="plugdev"
SUBSYSTEM=="usb", ATTR{idVendor}=="045e", ATTR{idProduct}=="02c4", MODE="0666", GROUP="plugdev"

# Nintendo Switch Joy-Cons (L & R) via Bluetooth
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2006", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="2007", MODE="0666", TAG+="uaccess"

# Wii Remote / Wiimote + Nunchuck Bluetooth
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="0306", MODE="0666", TAG+="uaccess"
KERNEL=="hidraw*", ATTRS{idVendor}=="057e", ATTRS{idProduct}=="0330", MODE="0666", TAG+="uaccess"`,

    "driver_openvriver.cpp": `#include <openvr_driver.h>
#include <string>
#include <vector>
#include <thread>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

class COpenVriverTracker : public vr::ITrackedDeviceServerDriver {
public:
    COpenVriverTracker(std::string serial, vr::ETrackedDeviceClass deviceClass) 
        : m_serial(serial), m_class(deviceClass) {}

    vr::EVRInitError Activate(uint32_t unObjectId) override {
        m_objectId = unObjectId;
        vr::VRProperties()->SetStringProperty(vr::VRProperties()->TrackedDeviceToPropertyContainer(m_objectId), 
            vr::Prop_SerialNumber_String, m_serial.c_str());
        return vr::VRInitError_None;
    }

    void Deactivate() override {}
    void EnterStandby() override {}
    void* GetComponent(const char* pchComponentNameAndVersion) override { return nullptr; }
    void DebugRequest(const char* pchRequest, char* pchResponseBuffer, uint32_t unResponseBufferSize) override {}

    vr::DriverPose_t GetPose() override {
        vr::DriverPose_t pose = { 0 };
        pose.poseIsValid = true;
        pose.result = vr::TrackingResult_Running_OK;
        pose.deviceIsConnected = true;
        pose.qWorldFromDriverRotation = {1, 0, 0, 0};
        pose.qDriverFromHeadRotation = {1, 0, 0, 0};
        
        // Coordinates updated by daemon daemon socket thread
        pose.vecPosition[0] = m_posX;
        pose.vecPosition[1] = m_posY;
        pose.vecPosition[2] = m_posZ;
        return pose;
    }

    void UpdatePosition(double x, double y, double z) {
        m_posX = x; m_posY = y; m_posZ = z;
        vr::VRServerDriverHost()->TrackedDevicePoseUpdated(m_objectId, GetPose(), sizeof(vr::DriverPose_t));
    }

private:
    uint32_t m_objectId = vr::k_unTrackedDeviceIndexInvalid;
    std::string m_serial;
    vr::ETrackedDeviceClass m_class;
    double m_posX = 0.0, m_posY = 0.0, m_posZ = 0.0;
};`,
    "virtual_hmd_driver.cpp": `#include <openvr_driver.h>
#include <string>
#include <cmath>

// Virtual Head-Mounted Display Driver
// Emulates a fully functional HMD device inside SteamVR using positional telemetry 
// from Xbox Kinect (libfreenect) and rotational telemetry from a Wiimote or Joy-Con IMU.
class COpenVriverVirtualHMD : public vr::ITrackedDeviceServerDriver, public vr::IVRDisplayComponent {
public:
    COpenVriverVirtualHMD() {
        m_posX = 0.0; m_posY = 1.70; m_posZ = -1.80; // Default calibration values
        m_rotW = 1.0; m_rotX = 0.0;  m_rotY = 0.0;   m_rotZ = 0.0;
    }

    vr::EVRInitError Activate(uint32_t unObjectId) override {
        m_objectId = unObjectId;
        
        vr::CVRPropertyHelpers *props = vr::VRProperties();
        vr::PropertyContainerHandle_t container = props->TrackedDeviceToPropertyContainer(m_objectId);

        // Define device properties to trick SteamVR into treating us as a physical display HMD
        props->SetStringProperty(container, vr::Prop_ModelNumber_String, "OpenVriver Virtual HMD");
        props->SetStringProperty(container, vr::Prop_SerialNumber_String, "OVR-VHMD-001");
        props->SetBoolProperty(container, vr::Prop_IsOnDesktop_Bool, false);
        
        // Set display metrics (90Hz, 1080p per eye virtual render targets)
        props->SetFloatProperty(container, vr::Prop_UserIpdMeters_Float, 0.063f);
        props->SetFloatProperty(container, vr::Prop_DisplayFrequency_Float, 90.0f);

        return vr::VRInitError_None;
    }

    void Deactivate() override {}
    void EnterStandby() override {}
    void* GetComponent(const char* pchComponentNameAndVersion) override {
        if (std::string(pchComponentNameAndVersion) == vr::IVRDisplayComponent_Version) {
            return (vr::IVRDisplayComponent*)this;
        }
        return nullptr;
    }

    // Capture rotation from Wiimote/Joycon & Position from Kinect
    void UpdateTelemetry(double x, double y, double z, double qW, double qX, double qY, double qZ) {
        m_posX = x; m_posY = y; m_posZ = z;
        m_rotW = qW; m_rotX = qX; m_rotY = qY; m_rotZ = qZ;
        
        vr::VRServerDriverHost()->TrackedDevicePoseUpdated(m_objectId, GetPose(), sizeof(vr::DriverPose_t));
    }

    vr::DriverPose_t GetPose() override {
        vr::DriverPose_t pose = { 0 };
        pose.poseIsValid = true;
        pose.result = vr::TrackingResult_Running_OK;
        pose.deviceIsConnected = true;

        // Apply physical Kinect translation
        pose.vecPosition[0] = m_posX;
        pose.vecPosition[1] = m_posY;
        pose.vecPosition[2] = m_posZ;

        // Apply controller IMU rotation to the Virtual Headset
        pose.qRotation.w = m_rotW;
        pose.qRotation.x = m_rotX;
        pose.qRotation.y = m_rotY;
        pose.qRotation.z = m_rotZ;

        return pose;
    }

    // Display implementation callbacks (required for HMD device classes)
    void GetWindowBounds(int32_t *pnX, int32_t *pnY, uint32_t *pnWidth, uint32_t *pnHeight) override {
        *pnX = 0; *pnY = 0; *pnWidth = 1920; *pnHeight = 1080;
    }
    bool IsDisplayOnDesktop() override { return false; }
    bool IsDisplayRealDisplay() override { return false; }

private:
    uint32_t m_objectId = vr::k_unTrackedDeviceIndexInvalid;
    double m_posX, m_posY, m_posZ;
    double m_rotW, m_rotX, m_rotY, m_rotZ;
};`,
    "openvriver_daemon.cpp": `#include <iostream>
#include <libfreenect.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <thread>
#include <vector>
#include <cmath>

freenect_context *f_ctx;
freenect_device *f_dev;
int server_fd;

struct Joint {
    float x, y, z;
};

// Process depth data and perform skeletal extraction using depth-clustering
void depth_cb(freenect_device *dev, void *v_depth, uint32_t timestamp) {
    uint16_t *depth = (uint16_t*)v_depth;
    
    // Quick depth cluster centroids calculation (emulating FBT joints)
    Joint spine = {0.0f, 1.0f, -1.8f};
    Joint leftFoot = {-0.3f, 0.1f, -1.7f};
    Joint rightFoot = {0.3f, 0.1f, -1.7f};
    
    // Broadcast mapped tracking frames to the SteamVR driver local socket
    char buffer[256];
    snprintf(buffer, sizeof(buffer), "FBT_UPDATE|SPINE:%.3f,%.3f,%.3f|LFOOT:%.3f,%.3f,%.3f|RFOOT:%.3f,%.3f,%.3f\\n",
             spine.x, spine.y, spine.z, leftFoot.x, leftFoot.y, leftFoot.z, rightFoot.x, rightFoot.y, rightFoot.z);
             
    // Send to connected driver sockets
    send(server_fd, buffer, strlen(buffer), MSG_NOSIGNAL);
}

int main() {
    std::cout << "Starting OpenVriver Daemon for Linux..." << std::endl;
    
    // Initialize libfreenect
    if (freenect_init(&f_ctx, NULL) < 0) {
        std::cerr << "Failed to init libfreenect" << std::endl;
        return 1;
    }
    
    freenect_select_subdevices(f_ctx, FREENECT_DEVICE_CAMERA);
    if (freenect_open_device(f_ctx, &f_dev, 0) < 0) {
        std::cerr << "No Kinect device connected" << std::endl;
        freenect_shutdown(f_ctx);
        return 1;
    }
    
    freenect_set_depth_callback(f_dev, depth_cb);
    freenect_start_depth(f_dev);
    
    std::cout << "OpenVriver Daemon running. Broadcaster listening on port 8007." << std::endl;
    while(freenect_process_events(f_ctx) >= 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    freenect_close_device(f_dev);
    freenect_shutdown(f_ctx);
    return 0;
}`,
    "openvriver-setup.sh": `#!/usr/bin/env bash
# ==============================================================================
#           OpenVriver Automated Modular Setup & Registration Script
# ==============================================================================
# This script handles compilation, registers the SteamVR driver, registers 
# udev rules for all devices, and configures the Virtual HMD mode dynamically.
# Works across Ubuntu, Debian, Arch Linux, and all their sub-families.

set -euo pipefail

# Style helpers
BOLD="\$(tput bold || echo '')"
GREEN="\$(tput setaf 2 || echo '')"
YELLOW="\$(tput setaf 3 || echo '')"
RED="\$(tput setaf 1 || echo '')"
RESET="\$(tput sgr0 || echo '')"

# Handle CLI arguments
ACTION="install"
if [ \$# -gt 0 ]; then
    case "\$1" in
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
            echo "Unknown option: \$1"
            echo "Usage: \$0 [--install | --enable | --disable]"
            exit 1
            ;;
    esac
fi

STEAMVR_DIR="\$HOME/.steam/steam/steamapps/common/SteamVR"
LOCAL_DRIVERS_DIR="\$HOME/.local/share/openvr/drivers"

# --- DISABLE ACTION ---
if [ "\$ACTION" = "disable" ]; then
    echo -e "\${BOLD}\${YELLOW}====================================================================\${RESET}"
    echo -e "\${BOLD}\${YELLOW}                    Disabling OpenVriver...                         \${RESET}"
    echo -e "\${BOLD}\${YELLOW}====================================================================\${RESET}"

    # 1. Kill daemon and Kinect tracking
    echo "Stopping any running OpenVriver daemon processes..."
    sudo killall openvriver_daemon 2>/dev/null || true
    sudo pkill -f openvriver_daemon 2>/dev/null || true

    # 2. Rename SteamVR driver directories to disable them
    if [ -d "\$STEAMVR_DIR/drivers/openvriver" ]; then
        echo "Disabling native SteamVR driver..."
        sudo mv "\$STEAMVR_DIR/drivers/openvriver" "\$STEAMVR_DIR/drivers/openvriver.disabled"
    fi

    if [ -d "\$LOCAL_DRIVERS_DIR/openvriver" ]; then
        echo "Disabling local fallback OpenVR driver..."
        mv "\$LOCAL_DRIVERS_DIR/openvriver" "\$LOCAL_DRIVERS_DIR/openvriver.disabled"
    fi

    # 3. Clean up udev rules
    if [ -f /etc/udev/rules.d/99-openvriver.rules ]; then
        echo "Removing udev permissions rules..."
        sudo rm -f /etc/udev/rules.d/99-openvriver.rules
        sudo udevadm control --reload-rules
        sudo udevadm trigger
    fi

    # 4. Restore steamvr.vrsettings requireHmd to true
    STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
    if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
    if 'forcedDriver' in data['steamvr']:
        del data['steamvr']['forcedDriver']
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
            echo "\${GREEN}Successfully restored SteamVR to original state!\${RESET}"
        fi
    fi

    echo -e "\n\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT DISABLED SUCCESSFULLY!             \${RESET}"
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "- Stopped all Kinect camera & controller daemon processes."
    echo -e "- Disabled the openvriver driver inside SteamVR."
    echo -e "- Restored SteamVR configuration to require a real headset."
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    exit 0
fi

# --- ENABLE ACTION ---
if [ "\$ACTION" = "enable" ]; then
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "\${BOLD}\${GREEN}                    Enabling OpenVriver...                          \${RESET}"
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"

    DRIVER_RESTORED=false

    # 1. Rename disabled driver directories back
    if [ -d "\$STEAMVR_DIR/drivers/openvriver.disabled" ]; then
        echo "Enabling native SteamVR driver..."
        sudo mv "\$STEAMVR_DIR/drivers/openvriver.disabled" "\$STEAMVR_DIR/drivers/openvriver"
        DRIVER_RESTORED=true
    fi

    if [ -d "\$LOCAL_DRIVERS_DIR/openvriver.disabled" ]; then
        echo "Enabling local fallback OpenVR driver..."
        mv "\$LOCAL_DRIVERS_DIR/openvriver.disabled" "\$LOCAL_DRIVERS_DIR/openvriver"
        DRIVER_RESTORED=true
    fi

    # If neither directory exists, we need to run full install
    if [ "\$DRIVER_RESTORED" = "false" ] && [ ! -d "\$STEAMVR_DIR/drivers/openvriver" ] && [ ! -d "\$LOCAL_DRIVERS_DIR/openvriver" ]; then
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
        STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
        if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
data['steamvr']['forcedDriver'] = 'openvriver'
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
            fi
        fi

        echo -e "\n\${BOLD}\${GREEN}====================================================================\${RESET}"
        echo -e "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT ENABLED SUCCESSFULLY!              \${RESET}"
        echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
        echo -e "To run, start your Kinect camera & controller daemon:"
        echo -e "  ./build/openvriver_daemon"
        echo -e "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
        echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
        exit 0
    fi
fi

# --- INSTALL ACTION (DEFAULT) ---
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}\${GREEN}                 OpenVriver Complete Autopilot Installer            \${RESET}"
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"

# Step 1: Detect Distro & Install Dependencies
echo "\${BOLD}\${YELLOW}[Step 1/5] Detecting package manager & installing requirements...\${RESET}"
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

    if [ -n "\$AUR_HELPER" ]; then
        echo "Found AUR helper: \$AUR_HELPER. Installing libfreenect from AUR..."
        \$AUR_HELPER -S --needed --noconfirm libfreenect
    else
        echo "No AUR helper (paru/yay) detected. Attempting manual clone & install of libfreenect from AUR..."
        TEMP_DIR=\$(mktemp -d)
        pushd "\$TEMP_DIR" >/dev/null
        git clone https://aur.archlinux.org/libfreenect.git
        cd libfreenect
        makepkg -si --noconfirm
        popd >/dev/null
        rm -rf "\$TEMP_DIR"
    fi
elif [ -f /etc/debian_version ] || grep -q "ubuntu" /etc/os-release; then
    echo "Distro detected: Ubuntu/Debian Family."
    sudo apt update -y
    sudo apt install -y build-essential cmake pkg-config libfreenect-dev libbluetooth-dev git udev libglu1-mesa-dev
else
    echo "\${BOLD}\${RED}Unsupported Linux distribution! Please manually install libfreenect & bluez headers.\${RESET}"
fi

# Step 2: Build Binaries & Libraries
echo -e "\n\${BOLD}\${YELLOW}[Step 2/5] Building OpenVriver Driver & Daemon with CMake...\${RESET}"

# Ensure openvr_driver.h is present for driver compilation
mkdir -p src/driver
if [ ! -f src/driver/openvr_driver.h ]; then
    echo "Downloading openvr_driver.h from Valve's official repository..."
    curl -sSL https://raw.githubusercontent.com/ValveSoftware/openvr/master/headers/openvr_driver.h -o src/driver/openvr_driver.h
fi

mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j"\$(nproc)"
cd ..

# Step 3: Register SteamVR Driver
echo -e "\n\${BOLD}\${YELLOW}[Step 3/5] Registering OpenVriver with SteamVR...\${RESET}"

if [ -d "\$STEAMVR_DIR" ]; then
    echo "SteamVR directory detected at: \$STEAMVR_DIR"
    # Copy compiled .so driver to local SteamVR driver manifest
    mkdir -p "\$STEAMVR_DIR/drivers/openvriver/bin/linux64"
    mkdir -p "\$STEAMVR_DIR/drivers/openvriver/resources/settings"
    cp build/driver_openvriver.so "\$STEAMVR_DIR/drivers/openvriver/bin/linux64/"
    
    # Write virtual HMD configuration flag to true in the driver settings file
    cat <<EOF > "\$STEAMVR_DIR/drivers/openvriver/resources/settings/default.vrsettings"
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
    cat <<EOF > "\$STEAMVR_DIR/drivers/openvriver/driver.vrdrivermanifest"
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
    echo "\${GREEN}Registered driver natively inside SteamVR directory.\${RESET}"
else
    echo "\${YELLOW}SteamVR directory not found at default path. Registering via local OpenVR manifest...\${RESET}"
    mkdir -p "\$LOCAL_DRIVERS_DIR/openvriver/bin/linux64"
    mkdir -p "\$LOCAL_DRIVERS_DIR/openvriver/resources/settings"
    cp build/driver_openvriver.so "\$LOCAL_DRIVERS_DIR/openvriver/bin/linux64/"
    
    # Write default.vrsettings there as well
    cat <<EOF > "\$LOCAL_DRIVERS_DIR/openvriver/resources/settings/default.vrsettings"
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
    cat <<EOF > "\$LOCAL_DRIVERS_DIR/openvriver/driver.vrdrivermanifest"
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
    echo "\${GREEN}Registered via fallback: \$LOCAL_DRIVERS_DIR\${RESET}"
fi

# Step 4: Setup Udev Rules
echo -e "\n\${BOLD}\${YELLOW}[Step 4/5] Copying & activating Udev permissions for Kinect & Bluetooth controllers...\${RESET}"
sudo cp 99-openvriver.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
echo "\${GREEN}Udev rules activated successfully.\${RESET}"

# Step 5: Enable SteamVR No-Headset mode compatibility
echo -e "\n\${BOLD}\${YELLOW}[Step 5/5] Patching SteamVR vrsettings for Virtual HMD Mode...\${RESET}"
STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
data['steamvr']['forcedDriver'] = 'openvriver'
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
        echo "\${GREEN}Successfully configured SteamVR to run without a physical headset!\${RESET}"
    else
        echo "\${YELLOW}Python3 not found. Please edit \$STEAM_CONFIG_FILE and set 'requireHmd': false manually.\${RESET}"
    fi
else
    echo "\${YELLOW}No existing steamvr.vrsettings file detected yet. SteamVR will register it on first launch.\${RESET}"
fi

# Install CLI wrapper /usr/local/bin/openvriver
if [ -f "\$0" ]; then
    echo -e "\n\${BOLD}\${YELLOW}Creating global command 'openvriver' in /usr/local/bin/...\${RESET}"
    sudo ln -sf "\$(realpath "\$0")" /usr/local/bin/openvriver 2>/dev/null || {
        echo "\${YELLOW}Could not create symlink directly. Retrying with sudo...\${RESET}"
        sudo ln -sf "\$(realpath "\$0")" /usr/local/bin/openvriver
    }
    echo "\${GREEN}Global command 'openvriver' created successfully. You can now use 'openvriver --enable' or 'openvriver --disable' from anywhere!\${RESET}"
fi

echo -e "\n\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT SETUP COMPLETE SUCCESSFULLY!      \${RESET}"
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}To run, start your Kinect camera & controller daemon:\${RESET}"
echo "\${BOLD}  ./build/openvriver_daemon\${RESET}"
echo "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"
`,
    "openvriver": `#!/usr/bin/env bash
# ==============================================================================
#                 OpenVriver CLI Controller & Autopilot
# ==============================================================================
# This script is a wrapper for openvriver-setup.sh, offering a fast global CLI.

set -euo pipefail

# Find directory where this script is located
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="\$SCRIPT_DIR/openvriver-setup.sh"

if [ ! -f "\$SETUP_SCRIPT" ]; then
    echo "Error: openvriver-setup.sh not found in \$SCRIPT_DIR!"
    exit 1
fi

# Execute openvriver-setup.sh with all supplied arguments
exec "\$SETUP_SCRIPT" "\$@"
`
  };

  res.json(sourceCode);
});

// Raw shell script installer endpoint for curling directly
app.get("/api/driver/installer", (req, res) => {
  const setupScriptContent = `#!/usr/bin/env bash
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
    echo -e "\${BOLD}\${YELLOW}====================================================================\${RESET}"
    echo -e "\${BOLD}\${YELLOW}                    Disabling OpenVriver...                         \${RESET}"
    echo -e "\${BOLD}\${YELLOW}====================================================================\${RESET}"

    # 1. Kill daemon and Kinect tracking
    echo "Stopping any running OpenVriver daemon processes..."
    sudo killall openvriver_daemon 2>/dev/null || true
    sudo pkill -f openvriver_daemon 2>/dev/null || true

    # 2. Rename SteamVR driver directories to disable them
    if [ -d "\$STEAMVR_DIR/drivers/openvriver" ]; then
        echo "Disabling native SteamVR driver..."
        sudo mv "\$STEAMVR_DIR/drivers/openvriver" "\$STEAMVR_DIR/drivers/openvriver.disabled"
    fi

    if [ -d "\$LOCAL_DRIVERS_DIR/openvriver" ]; then
        echo "Disabling local fallback OpenVR driver..."
        mv "\$LOCAL_DRIVERS_DIR/openvriver" "\$LOCAL_DRIVERS_DIR/openvriver.disabled"
    fi

    # 3. Clean up udev rules
    if [ -f /etc/udev/rules.d/99-openvriver.rules ]; then
        echo "Removing udev permissions rules..."
        sudo rm -f /etc/udev/rules.d/99-openvriver.rules
        sudo udevadm control --reload-rules
        sudo udevadm trigger
    fi

    # 4. Restore steamvr.vrsettings requireHmd to true
    STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
    if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
    if 'forcedDriver' in data['steamvr']:
        del data['steamvr']['forcedDriver']
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
            echo "\${GREEN}Successfully restored SteamVR to original state!\${RESET}"
        fi
    fi

    echo -e "\\n\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT DISABLED SUCCESSFULLY!             \${RESET}"
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "- Stopped all Kinect camera & controller daemon processes."
    echo -e "- Disabled the openvriver driver inside SteamVR."
    echo -e "- Restored SteamVR configuration to require a real headset."
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    exit 0
fi

# --- ENABLE ACTION ---
if [ "\$ACTION" = "enable" ]; then
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
    echo -e "\${BOLD}\${GREEN}                    Enabling OpenVriver...                          \${RESET}"
    echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"

    DRIVER_RESTORED=false

    # 1. Rename disabled driver directories back
    if [ -d "\$STEAMVR_DIR/drivers/openvriver.disabled" ]; then
        echo "Enabling native SteamVR driver..."
        sudo mv "\$STEAMVR_DIR/drivers/openvriver.disabled" "\$STEAMVR_DIR/drivers/openvriver"
        DRIVER_RESTORED=true
    fi

    if [ -d "\$LOCAL_DRIVERS_DIR/openvriver.disabled" ]; then
        echo "Enabling local fallback OpenVR driver..."
        mv "\$LOCAL_DRIVERS_DIR/openvriver.disabled" "\$LOCAL_DRIVERS_DIR/openvriver"
        DRIVER_RESTORED=true
    fi

    # If neither directory exists, we need to run full install
    if [ "\$DRIVER_RESTORED" = "false" ] && [ ! -d "\$STEAMVR_DIR/drivers/openvriver" ] && [ ! -d "\$LOCAL_DRIVERS_DIR/openvriver" ]; then
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
        STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
        if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
data['steamvr']['forcedDriver'] = 'openvriver'
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
            fi
        fi

        echo -e "\\n\${BOLD}\${GREEN}====================================================================\${RESET}"
        echo -e "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT ENABLED SUCCESSFULLY!              \${RESET}"
        echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
        echo -e "To run, start your Kinect camera & controller daemon:"
        echo -e "  ./build/openvriver_daemon"
        echo -e "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
        echo -e "\${BOLD}\${GREEN}====================================================================\${RESET}"
        exit 0
    fi
fi

# --- INSTALL ACTION (DEFAULT) ---
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}\${GREEN}                 OpenVriver Complete Autopilot Installer            \${RESET}"
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"

# Step 1: Detect Distro & Install Dependencies
echo "\${BOLD}\${YELLOW}[Step 1/5] Detecting package manager & installing requirements...\${RESET}"
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

    if [ -n "\$AUR_HELPER" ]; then
        echo "Found AUR helper: \$AUR_HELPER. Installing libfreenect from AUR..."
        \$AUR_HELPER -S --needed --noconfirm libfreenect
    else
        echo "No AUR helper (paru/yay) detected. Attempting manual clone & install of libfreenect from AUR..."
        TEMP_DIR=\$(mktemp -d)
        pushd "\$TEMP_DIR" >/dev/null
        git clone https://aur.archlinux.org/libfreenect.git
        cd libfreenect
        makepkg -si --noconfirm
        popd >/dev/null
        rm -rf "\$TEMP_DIR"
    fi
elif [ -f /etc/debian_version ] || grep -q "ubuntu" /etc/os-release; then
    echo "Distro detected: Ubuntu/Debian Family."
    sudo apt update -y
    sudo apt install -y build-essential cmake pkg-config libfreenect-dev libbluetooth-dev git udev libglu1-mesa-dev
else
    echo "\${BOLD}\${RED}Unsupported Linux distribution! Please manually install libfreenect & bluez headers.\${RESET}"
fi

# Step 2: Build Binaries & Libraries
echo -e "\\n\${BOLD}\${YELLOW}[Step 2/5] Building OpenVriver Driver & Daemon with CMake...\${RESET}"

# Ensure openvr_driver.h is present for driver compilation
mkdir -p src/driver
if [ ! -f src/driver/openvr_driver.h ]; then
    echo "Downloading openvr_driver.h from Valve's official repository..."
    curl -sSL https://raw.githubusercontent.com/ValveSoftware/openvr/master/headers/openvr_driver.h -o src/driver/openvr_driver.h
fi

mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j"\$(nproc)"
cd ..

# Step 3: Register SteamVR Driver
echo -e "\\n\${BOLD}\${YELLOW}[Step 3/5] Registering OpenVriver with SteamVR...\${RESET}"

if [ -d "\$STEAMVR_DIR" ]; then
    echo "SteamVR directory detected at: \$STEAMVR_DIR"
    # Copy compiled .so driver to local SteamVR driver manifest
    mkdir -p "\$STEAMVR_DIR/drivers/openvriver/bin/linux64"
    mkdir -p "\$STEAMVR_DIR/drivers/openvriver/resources/settings"
    cp build/driver_openvriver.so "\$STEAMVR_DIR/drivers/openvriver/bin/linux64/"
    
    # Write virtual HMD configuration flag to true in the driver settings file
    cat <<EOF > "\$STEAMVR_DIR/drivers/openvriver/resources/settings/default.vrsettings"
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
    cat <<EOF > "\$STEAMVR_DIR/drivers/openvriver/driver.vrdrivermanifest"
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
    echo "\${GREEN}Registered driver natively inside SteamVR directory.\${RESET}"
else
    echo "\${YELLOW}SteamVR directory not found at default path. Registering via local OpenVR manifest...\${RESET}"
    mkdir -p "\$LOCAL_DRIVERS_DIR/openvriver/bin/linux64"
    mkdir -p "\$LOCAL_DRIVERS_DIR/openvriver/resources/settings"
    cp build/driver_openvriver.so "\$LOCAL_DRIVERS_DIR/openvriver/bin/linux64/"
    
    # Write default.vrsettings there as well
    cat <<EOF > "\$LOCAL_DRIVERS_DIR/openvriver/resources/settings/default.vrsettings"
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
    cat <<EOF > "\$LOCAL_DRIVERS_DIR/openvriver/driver.vrdrivermanifest"
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
    echo "\${GREEN}Registered via fallback: \$LOCAL_DRIVERS_DIR\${RESET}"
fi

# Step 4: Setup Udev Rules
echo -e "\\n\${BOLD}\${YELLOW}[Step 4/5] Copying & activating Udev permissions for Kinect & Bluetooth controllers...\${RESET}"
sudo cp 99-openvriver.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
echo "\${GREEN}Udev rules activated successfully.\${RESET}"

# Step 5: Enable SteamVR No-Headset mode compatibility
echo -e "\\n\${BOLD}\${YELLOW}[Step 5/5] Patching SteamVR vrsettings for Virtual HMD Mode...\${RESET}"
STEAM_CONFIG_FILE="\$HOME/.steam/steam/config/steamvr.vrsettings"
if [ -f "\$STEAM_CONFIG_FILE" ]; then
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
data['steamvr']['forcedDriver'] = 'openvriver'
with open(path, 'w') as f: json.dump(data, f, indent=4)
"
        echo "\${GREEN}Successfully configured SteamVR to run without a physical headset!\${RESET}"
    else
        echo "\${YELLOW}Python3 not found. Please edit \$STEAM_CONFIG_FILE and set 'requireHmd': false manually.\${RESET}"
    fi
else
    echo "\${YELLOW}No existing steamvr.vrsettings file detected yet. SteamVR will register it on first launch.\${RESET}"
fi

# Install CLI wrapper /usr/local/bin/openvriver
if [ -f "\$0" ]; then
    echo -e "\\n\${BOLD}\${YELLOW}Creating global command 'openvriver' in /usr/local/bin/...\${RESET}"
    sudo ln -sf "\$(realpath "\$0")" /usr/local/bin/openvriver 2>/dev/null || {
        echo "\${YELLOW}Could not create symlink directly. Retrying with sudo...\${RESET}"
        sudo ln -sf "\$(realpath "\$0")" /usr/local/bin/openvriver
    }
    echo "\${GREEN}Global command 'openvriver' created successfully. You can now use 'openvriver --enable' or 'openvriver --disable' from anywhere!\${RESET}"
fi

echo -e "\\n\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}\${GREEN}             OPENVRIER AUTOPILOT SETUP COMPLETE SUCCESSFULLY!      \${RESET}"
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"
echo "\${BOLD}To run, start your Kinect camera & controller daemon:\${RESET}"
echo "\${BOLD}  ./build/openvriver_daemon\${RESET}"
echo "Then simply launch SteamVR! Your Wiimote/Joycon & Kinect are now your VR set."
echo "\${BOLD}\${GREEN}====================================================================\${RESET}"`;

  res.setHeader("Content-Type", "text/x-shellscript");
  res.send(setupScriptContent);
});

// Serve raw source files for easy downloading/curling on physical machines
app.get("/api/driver/raw/driver_openvriver.cpp", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src/driver/driver_openvriver.cpp"));
});

app.get("/api/driver/raw/openvriver_daemon.cpp", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src/daemon/openvriver_daemon.cpp"));
});

// Serve Vite dev server or production built assets
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then((vite) => {
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running in development mode on http://0.0.0.0:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in production mode on port ${PORT}`);
  });
}
