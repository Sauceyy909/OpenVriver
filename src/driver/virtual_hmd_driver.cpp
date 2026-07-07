#include <openvr_driver.h>
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
        vr::PropertyContainerHandle_t container = props->GetPropertyContainer(m_objectId);

        // Define device properties to trick SteamVR into treating us as a physical display HMD
        props->SetStringProperty(container, vr::Prop_ModelNumber_String, "OpenVriver Virtual HMD");
        props->SetStringProperty(container, vr::Prop_SerialNumber_String, "OVR-VHMD-001");
        props->SetBoolProperty(container, vr::Prop_IsOnDesktop_Bool, false);
        
        // Set display metrics (90Hz, 1080p per eye virtual render targets)
        props->SetFloatProperty(container, vr::Prop_UserIpdMeters_Float, 0.063f);
        props->SetFloatProperty(container, vr::Prop_DisplayFrequency_Float, 90.0f);
        props->SetInt32Property(container, vr::Prop_WindowWidth_Int32, 1920);
        props->SetInt32Property(container, vr::Prop_WindowHeight_Int32, 1080);

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
};
