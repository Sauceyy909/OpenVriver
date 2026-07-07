#include <openvr_driver.h>
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
};
