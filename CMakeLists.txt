cmake_minimum_required(VERSION 3.12)
project(openvriver VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
find_package(PkgConfig REQUIRED)
pkg_check_modules(FREENECT REQUIRED libfreenect)
pkg_check_modules(BLUEZ REQUIRED bluez)

# Include directories
include_directories(${FREENECT_INCLUDE_DIRS} ${BLUEZ_INCLUDE_DIRS} src/driver src/daemon)

# 1. Build the SteamVR Driver Shared Library (.so)
add_library(driver_openvriver SHARED 
    src/driver/driver_openvriver.cpp
)
target_link_libraries(driver_openvriver PRIVATE pthread)
set_target_properties(driver_openvriver PROPERTIES PREFIX "")

# 2. Build the Hardware Daemon
add_executable(openvriver_daemon
    src/daemon/openvriver_daemon.cpp
)
target_link_libraries(openvriver_daemon PRIVATE 
    ${FREENECT_LIBRARIES} 
    ${BLUEZ_LIBRARIES} 
    pthread
)
