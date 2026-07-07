#include <openvr_driver.h>
#include <string>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <sstream>

// ==============================================================================
// 1. Virtual Head-Mounted Display Driver Class
// ==============================================================================
class COpenVriverVirtualHMD : public vr::ITrackedDeviceServerDriver, public vr::IVRDisplayComponent {
public:
    COpenVriverVirtualHMD() {
        m_posX = 0.0; m_posY = 1.70; m_posZ = -1.80; // Default calibration values
        m_rotW = 1.0; m_rotX = 0.0;  m_rotY = 0.0;   m_rotZ = 0.0;
        m_objectId = vr::k_unTrackedDeviceIndexInvalid;
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
        props->SetInt32Property(container, vr::Prop_DeviceClass_Int32, vr::TrackedDeviceClass_HMD);

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
    void DebugRequest(const char* pchRequest, char* pchResponseBuffer, uint32_t unResponseBufferSize) override {}

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

        pose.qWorldFromDriverRotation = {1, 0, 0, 0};
        pose.qDriverFromHeadRotation = {1, 0, 0, 0};

        return pose;
    }

    void UpdateTelemetry(double x, double y, double z, double qW, double qX, double qY, double qZ) {
        m_posX = x; m_posY = y; m_posZ = z;
        m_rotW = qW; m_rotX = qX; m_rotY = qY; m_rotZ = qZ;
        if (m_objectId != vr::k_unTrackedDeviceIndexInvalid) {
            vr::VRServerDriverHost()->TrackedDevicePoseUpdated(m_objectId, GetPose(), sizeof(vr::DriverPose_t));
        }
    }

    // IVRDisplayComponent Display callbacks (required for HMD device classes)
    void GetWindowBounds(int32_t *pnX, int32_t *pnY, uint32_t *pnWidth, uint32_t *pnHeight) override {
        *pnX = 0; *pnY = 0; *pnWidth = 1920; *pnHeight = 1080;
    }
    bool IsDisplayOnDesktop() override { return false; }
    bool IsDisplayRealDisplay() override { return false; }

    void GetRecommendedResolution(uint32_t *pnWidth, uint32_t *pnHeight) override {
        *pnWidth = 1920;
        *pnHeight = 1080;
    }
    void GetEyeOutputViewport(vr::EVREye eEye, uint32_t *pnX, uint32_t *pnY, uint32_t *pnWidth, uint32_t *pnHeight) override {
        *pnX = (eEye == vr::Eye_Left) ? 0 : 960;
        *pnY = 0;
        *pnWidth = 960;
        *pnHeight = 1080;
    }
    void GetProjectionRaw(vr::EVREye eEye, float *pfLeft, float *pfRight, float *pfTop, float *pfBottom) override {
        *pfLeft = -1.0f;
        *pfRight = 1.0f;
        *pfTop = -1.0f;
        *pfBottom = 1.0f;
    }
    vr::DistortionCoordinates_t ComputeDistortion(vr::EVREye eEye, float fU, float fV) override {
        vr::DistortionCoordinates_t coordinates;
        coordinates.rfRed[0] = fU;
        coordinates.rfRed[1] = fV;
        coordinates.rfGreen[0] = fU;
        coordinates.rfGreen[1] = fV;
        coordinates.rfBlue[0] = fU;
        coordinates.rfBlue[1] = fV;
        return coordinates;
    }

private:
    uint32_t m_objectId;
    double m_posX, m_posY, m_posZ;
    double m_rotW, m_rotX, m_rotY, m_rotZ;
};

// ==============================================================================
// 2. Full Body Tracker Emulation Class
// ==============================================================================
class COpenVriverTracker : public vr::ITrackedDeviceServerDriver {
public:
    COpenVriverTracker(std::string serial, vr::ETrackedDeviceClass deviceClass) 
        : m_serial(serial), m_class(deviceClass) {
        m_posX = 0.0; m_posY = 0.0; m_posZ = 0.0;
        m_objectId = vr::k_unTrackedDeviceIndexInvalid;
    }

    vr::EVRInitError Activate(uint32_t unObjectId) override {
        m_objectId = unObjectId;
        vr::CVRPropertyHelpers *props = vr::VRProperties();
        vr::PropertyContainerHandle_t container = props->TrackedDeviceToPropertyContainer(m_objectId);

        props->SetStringProperty(container, vr::Prop_SerialNumber_String, m_serial.c_str());
        props->SetStringProperty(container, vr::Prop_ModelNumber_String, "OpenVriver Custom Tracker");
        props->SetInt32Property(container, vr::Prop_DeviceClass_Int32, m_class);
        props->SetBoolProperty(container, vr::Prop_Identifiable_Bool, true);

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
        pose.qRotation = {1, 0, 0, 0};
        
        pose.vecPosition[0] = m_posX;
        pose.vecPosition[1] = m_posY;
        pose.vecPosition[2] = m_posZ;
        return pose;
    }

    void UpdatePosition(double x, double y, double z) {
        m_posX = x; m_posY = y; m_posZ = z;
        if (m_objectId != vr::k_unTrackedDeviceIndexInvalid) {
            vr::VRServerDriverHost()->TrackedDevicePoseUpdated(m_objectId, GetPose(), sizeof(vr::DriverPose_t));
        }
    }

private:
    uint32_t m_objectId;
    std::string m_serial;
    vr::ETrackedDeviceClass m_class;
    double m_posX, m_posY, m_posZ;
};

// ==============================================================================
// 3. SteamVR Server Tracked Device Provider Implementation
// ==============================================================================
class COpenVriverProvider : public vr::IServerTrackedDeviceProvider {
public:
    COpenVriverProvider() {
        m_pHmd = nullptr;
        m_pSpineTracker = nullptr;
        m_pLeftFootTracker = nullptr;
        m_pRightFootTracker = nullptr;
        m_bRunning = false;
        m_serverFd = -1;
    }

    vr::EVRInitError Init(vr::IVRDriverContext* pDriverContext) override {
        VR_INIT_SERVER_DRIVER_CONTEXT(pDriverContext);

        // Instantiate and register Virtual Headset (HMD)
        m_pHmd = new COpenVriverVirtualHMD();
        vr::VRServerDriverHost()->TrackedDeviceAdded("OVR-VHMD-001", vr::TrackedDeviceClass_HMD, m_pHmd);

        // Instantiate and register skeletal joint trackers (Spine, Left Foot, Right Foot)
        m_pSpineTracker = new COpenVriverTracker("OVR-TRK-SPINE", vr::TrackedDeviceClass_GenericTracker);
        vr::VRServerDriverHost()->TrackedDeviceAdded("OVR-TRK-SPINE", vr::TrackedDeviceClass_GenericTracker, m_pSpineTracker);

        m_pLeftFootTracker = new COpenVriverTracker("OVR-TRK-LFOOT", vr::TrackedDeviceClass_GenericTracker);
        vr::VRServerDriverHost()->TrackedDeviceAdded("OVR-TRK-LFOOT", vr::TrackedDeviceClass_GenericTracker, m_pLeftFootTracker);

        m_pRightFootTracker = new COpenVriverTracker("OVR-TRK-RFOOT", vr::TrackedDeviceClass_GenericTracker);
        vr::VRServerDriverHost()->TrackedDeviceAdded("OVR-TRK-RFOOT", vr::TrackedDeviceClass_GenericTracker, m_pRightFootTracker);

        // Spin up background telemetry socket receiver thread (port 8007)
        m_bRunning = true;
        m_socketThread = std::thread(&COpenVriverProvider::SocketThreadLoop, this);

        return vr::VRInitError_None;
    }

    void Cleanup() override {
        m_bRunning = false;
        if (m_serverFd != -1) {
            close(m_serverFd);
            m_serverFd = -1;
        }
        if (m_socketThread.joinable()) {
            m_socketThread.join();
        }

        delete m_pHmd; m_pHmd = nullptr;
        delete m_pSpineTracker; m_pSpineTracker = nullptr;
        delete m_pLeftFootTracker; m_pLeftFootTracker = nullptr;
        delete m_pRightFootTracker; m_pRightFootTracker = nullptr;
    }

    const char* const* GetInterfaceVersions() override {
        return vr::k_InterfaceVersions;
    }

    void RunFrame() override {}
    bool ShouldBlockStandbyMode() override { return false; }
    void EnterStandby() override {}
    void LeaveStandby() override {}

private:
    void SocketThreadLoop() {
        m_serverFd = socket(AF_INET, SOCK_STREAM, 0);
        if (m_serverFd < 0) return;

        int opt = 1;
        setsockopt(m_serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        sockaddr_in address;
        std::memset(&address, 0, sizeof(address));
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(8007); // Driver port listens on 8007

        if (bind(m_serverFd, (struct sockaddr*)&address, sizeof(address)) < 0) {
            close(m_serverFd);
            m_serverFd = -1;
            return;
        }

        if (listen(m_serverFd, 3) < 0) {
            close(m_serverFd);
            m_serverFd = -1;
            return;
        }

        while (m_bRunning) {
            int clientFd = accept(m_serverFd, nullptr, nullptr);
            if (clientFd < 0) {
                if (!m_bRunning) break;
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                continue;
            }

            char buffer[1024];
            std::string remainingData = "";

            while (m_bRunning) {
                ssize_t bytesRead = recv(clientFd, buffer, sizeof(buffer) - 1, 0);
                if (bytesRead <= 0) {
                    close(clientFd);
                    break;
                }

                buffer[bytesRead] = '\0';
                std::string data = remainingData + std::string(buffer);
                size_t newlinePos;
                while ((newlinePos = data.find('\n')) != std::string::npos) {
                    std::string line = data.substr(0, newlinePos);
                    data = data.substr(newlinePos + 1);
                    ParseTelemetryLine(line);
                }
                remainingData = data;
            }
        }
        if (m_serverFd != -1) {
            close(m_serverFd);
            m_serverFd = -1;
        }
    }

    void ParseTelemetryLine(const std::string& line) {
        if (line.rfind("FBT_UPDATE", 0) == 0) {
            std::vector<std::string> parts = Split(line, '|');
            for (size_t i = 1; i < parts.size(); ++i) {
                std::vector<std::string> sub = Split(parts[i], ':');
                if (sub.size() == 2) {
                    std::string jointName = sub[0];
                    std::vector<std::string> coords = Split(sub[1], ',');
                    if (coords.size() == 3) {
                        try {
                            double x = std::stod(coords[0]);
                            double y = std::stod(coords[1]);
                            double z = std::stod(coords[2]);
                            
                            if (jointName == "SPINE" && m_pSpineTracker) {
                                m_pSpineTracker->UpdatePosition(x, y, z);
                            } else if (jointName == "LFOOT" && m_pLeftFootTracker) {
                                m_pLeftFootTracker->UpdatePosition(x, y, z);
                            } else if (jointName == "RFOOT" && m_pRightFootTracker) {
                                m_pRightFootTracker->UpdatePosition(x, y, z);
                            }
                        } catch (...) {}
                    }
                }
            }
        } else if (line.rfind("HMD_UPDATE", 0) == 0) {
            std::vector<std::string> parts = Split(line, '|');
            if (parts.size() == 3) {
                std::vector<std::string> pos = Split(parts[1], ',');
                std::vector<std::string> rot = Split(parts[2], ',');
                if (pos.size() == 3 && rot.size() == 4) {
                    try {
                        double px = std::stod(pos[0]);
                        double py = std::stod(pos[1]);
                        double pz = std::stod(pos[2]);

                        double rw = std::stod(rot[0]);
                        double rx = std::stod(rot[1]);
                        double ry = std::stod(rot[2]);
                        double rz = std::stod(rot[3]);

                        if (m_pHmd) {
                            m_pHmd->UpdateTelemetry(px, py, pz, rw, rx, ry, rz);
                        }
                    } catch (...) {}
                }
            }
        }
    }

    std::vector<std::string> Split(const std::string& s, char delimiter) {
        std::vector<std::string> tokens;
        std::string token;
        std::istringstream tokenStream(s);
        while (std::getline(tokenStream, token, delimiter)) {
            tokens.push_back(token);
        }
        return tokens;
    }

    COpenVriverVirtualHMD* m_pHmd;
    COpenVriverTracker* m_pSpineTracker;
    COpenVriverTracker* m_pLeftFootTracker;
    COpenVriverTracker* m_pRightFootTracker;
    std::atomic<bool> m_bRunning;
    std::thread m_socketThread;
    int m_serverFd;
};

COpenVriverProvider g_serverDriver;

// ==============================================================================
// 4. Expose the OpenVR Driver Entry Point (HmdDriverFactory)
// ==============================================================================
#if defined(_WIN32)
#define DLL_EXPORT __declspec(dllexport)
#else
#define DLL_EXPORT __attribute__((visibility("default")))
#endif

extern "C" DLL_EXPORT void* HmdDriverFactory(const char *pInterfaceName, int *pReturnCode) {
    if (std::string(pInterfaceName) == vr::IServerTrackedDeviceProvider_Version) {
        return &g_serverDriver;
    }
    if (pReturnCode) {
        *pReturnCode = vr::VRInitError_Init_InterfaceNotFound;
    }
    return nullptr;
}
