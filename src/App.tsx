import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Settings, 
  Cpu, 
  Sliders, 
  Download, 
  Check, 
  Copy, 
  Play, 
  Info, 
  Layers, 
  Radio, 
  Activity, 
  Smartphone, 
  Code,
  Github,
  Wifi,
  WifiOff,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  FolderOpen,
  Eye,
  Zap,
  SlidersHorizontal,
  Compass,
  Monitor,
  Heart
} from "lucide-react";

type DistroType = "arch" | "ubuntu";
type TabType = "installation" | "hmd" | "driver" | "controller" | "udev";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("installation");
  const [selectedDistro, setSelectedDistro] = useState<DistroType>("arch");
  
  // Real daemon connection states
  const [daemonConnected, setDaemonConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [incomingFrameCount, setIncomingFrameCount] = useState<number>(0);
  
  // Interactive Simulation coordinates and rotation (yaw, pitch, roll) for the Virtual HMD
  const [hmdYaw, setHmdYaw] = useState<number>(0);
  const [hmdPitch, setHmdPitch] = useState<number>(0);
  const [hmdRoll, setHmdRoll] = useState<number>(0);
  const [hmdX, setHmdX] = useState<number>(0.0);
  const [hmdY, setHmdY] = useState<number>(1.70);
  const [hmdZ, setHmdZ] = useState<number>(-1.80);

  // Tracking points
  const [trackingCoordinates, setTrackingCoordinates] = useState<Record<string, {x: number, y: number, z: number}>>({
    spine: { x: 0.0, y: 1.05, z: -1.90 },
    left_foot: { x: -0.25, y: 0.08, z: -1.85 },
    right_foot: { x: 0.25, y: 0.08, z: -1.85 }
  });

  // Source files cache from API
  const [sourceFiles, setSourceFiles] = useState<Record<string, string>>({});
  const [selectedSourceFileName, setSelectedSourceFileName] = useState<string>("openvriver-setup.sh");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);

  // Auto-simulate when disconnected so the user can see beautiful, real-time responsive UI state
  useEffect(() => {
    if (!daemonConnected) {
      const interval = setInterval(() => {
        // Subtle drift emulation
        setTrackingCoordinates(prev => {
          const osc = Math.sin(Date.now() / 1200) * 0.04;
          return {
            spine: { x: osc, y: 1.05 + Math.cos(Date.now() / 1500) * 0.02, z: -1.90 },
            left_foot: { x: -0.25 + osc, y: 0.08 + Math.abs(Math.sin(Date.now() / 900)) * 0.05, z: -1.85 },
            right_foot: { x: 0.25 + osc, y: 0.08 + Math.abs(Math.cos(Date.now() / 900)) * 0.05, z: -1.85 }
          };
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [daemonConnected]);

  // Attempt real WebSocket connection to local running daemon (ws://localhost:8007)
  const connectToLocalDaemon = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const socketUrl = "ws://localhost:8007";
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setDaemonConnected(true);
      console.log("Connected to local OpenVriver background daemon on port 8007.");
    };

    ws.onmessage = (event) => {
      setIncomingFrameCount(prev => prev + 1);
      const dataStr = event.data;
      setLastMessage(dataStr);

      // Parse real frame data from C++ daemon
      // Expected payload format: "FBT_UPDATE|SPINE:x,y,z|LFOOT:x,y,z|RFOOT:x,y,z|VHMD_ROT:w,x,y,z"
      if (dataStr.startsWith("FBT_UPDATE")) {
        const parts = dataStr.split("|");
        const coords: Record<string, {x: number, y: number, z: number}> = {};
        
        parts.slice(1).forEach((part: string) => {
          const [jointName, values] = part.split(":");
          if (jointName && values) {
            const parsed = values.split(",").map(Number);
            if (parsed.length >= 3) {
              const [x, y, z] = parsed;
              if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                coords[jointName.toLowerCase()] = { x, y, z };
                if (jointName.toLowerCase() === "spine") {
                  setHmdX(x);
                  setHmdY(y + 0.65); // Head height above spine
                  setHmdZ(z);
                }
              }
            }
          }
        });

        if (Object.keys(coords).length > 0) {
          setTrackingCoordinates(prev => ({
            ...prev,
            ...coords
          }));
        }
      }
    };

    ws.onclose = () => {
      setDaemonConnected(false);
      console.log("Disconnected from local OpenVriver background daemon.");
    };

    ws.onerror = () => {
      setDaemonConnected(false);
    };
  };

  // Connect on mount, retry every 5s if disconnected
  useEffect(() => {
    connectToLocalDaemon();
    const interval = setInterval(() => {
      if (!daemonConnected) {
        connectToLocalDaemon();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      if (socketRef.current) socketRef.current.close();
    };
  }, [daemonConnected]);

  // Load the production C++ source files from server on mount
  useEffect(() => {
    fetch("/api/driver/source-code")
      .then(res => res.json())
      .then(data => {
        setSourceFiles(data);
      })
      .catch(err => console.error("Failed to load source code:", err));
  }, []);

  const handleCopyCode = (filename: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  return (
    <div id="openvriver-app" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col antialiased selection:bg-amber-500/30 selection:text-amber-200">
      
      {/* Top Header Bar */}
      <header id="header-bar" className="border-b border-neutral-900 bg-neutral-950 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-600 to-yellow-400 opacity-80 group-hover:scale-110 transition-transform"></div>
            <Radio className="w-5 h-5 text-neutral-950 stroke-[2.5] relative z-10 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-neutral-100 to-neutral-400 bg-clip-text text-transparent">
                OpenVriver
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                v1.2.0 Autopilot
              </span>
            </div>
            <p className="text-xs text-neutral-400">Better, modular SteamVR alternative to Driver4VR with Virtual HMD support</p>
          </div>
        </div>

        {/* Global Environment Config */}
        <div className="flex flex-wrap items-center gap-4">
          
          {/* Target Linux Distro Switcher */}
          <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
            <button
              onClick={() => setSelectedDistro("arch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                selectedDistro === "arch" 
                  ? "bg-amber-500 text-neutral-950 font-bold shadow-md" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Arch Linux (AUR / paru)
            </button>
            <button
              onClick={() => setSelectedDistro("ubuntu")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all ${
                selectedDistro === "ubuntu" 
                  ? "bg-amber-500 text-neutral-950 font-bold shadow-md" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Ubuntu / Debian
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Local daemon connection status and primary navigation */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* ACTIVE STATUS & HUB DIAGNOSTICS */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Connectivity Hub
              </span>
              <button 
                onClick={connectToLocalDaemon}
                className="p-1 rounded bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-400 transition-colors"
                title="Force Reconnect Daemon"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 bg-neutral-950/70 border border-neutral-850 p-4 rounded-lg">
              {daemonConnected ? (
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></div>
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-rose-500 flex-shrink-0"></div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-100">
                  {daemonConnected ? "Hardware Daemon Connected" : "Simulation State Active"}
                </p>
                <p className="text-xs font-mono text-neutral-500 truncate mt-0.5">
                  ws://127.0.0.1:8007
                </p>
              </div>
            </div>

            {daemonConnected ? (
              <div className="font-mono text-[11px] bg-neutral-950 p-3 rounded border border-neutral-850 flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Telemetry Frame:</span>
                  <span className="text-emerald-400 font-semibold">{incomingFrameCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Last Raw Buffer:</span>
                  <span className="text-neutral-300 truncate max-w-[180px]" title={lastMessage}>
                    {lastMessage || "Waiting for stream..."}
                  </span>
                </div>
                <div className="flex justify-between border-t border-neutral-900 pt-2 mt-1">
                  <span className="text-neutral-500">SteamVR Driver:</span>
                  <span className="text-emerald-400 font-semibold">LOADED (virtual_hmd)</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/5 border border-amber-500/25 p-4 rounded-lg flex gap-3 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1.5">
                  <p className="text-amber-200 font-semibold">Using client-side simulation.</p>
                  <p className="text-neutral-400 leading-normal text-[11px]">
                    To stream real-time depth skeleton telemetry from physical sensors or Wiimote orientation, install and launch the OpenVriver daemon on your Linux device.
                  </p>
                  <div className="mt-1">
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                      Local listening: ws://localhost:8007
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick terminal launch command */}
            <div className="font-mono text-xs bg-neutral-950 p-3.5 rounded-lg border border-neutral-850">
              <span className="text-neutral-500"># Run direct autopilot script:</span>
              <div className="flex items-center justify-between bg-neutral-900/50 p-2 rounded mt-1.5 border border-neutral-800">
                <code className="text-amber-300 text-[11px] overflow-x-auto whitespace-nowrap">
                  curl -sSL https://openvriver.org/setup.sh | bash
                </code>
                <button 
                  onClick={() => handleCopyCode("cmd", "curl -sSL https://openvriver.org/setup.sh | bash")}
                  className="text-neutral-400 hover:text-neutral-200 ml-2"
                >
                  {copiedFile === "cmd" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

          </div>

          {/* TAB NAVIGATION BUTTONS */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex flex-col gap-1 shadow-lg">
            
            <button
              onClick={() => setActiveTab("installation")}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                activeTab === "installation" 
                  ? "bg-amber-500 text-neutral-950 font-bold" 
                  : "hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Download className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wide">Autopilot Setup Script</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab("hmd")}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                activeTab === "hmd" 
                  ? "bg-amber-500 text-neutral-950 font-bold" 
                  : "hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Monitor className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wide">Virtual HMD Emulator</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab("driver")}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                activeTab === "driver" 
                  ? "bg-amber-500 text-neutral-950 font-bold" 
                  : "hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wide">Kinect Skeletal Driver</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab("controller")}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                activeTab === "controller" 
                  ? "bg-amber-500 text-neutral-950 font-bold" 
                  : "hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wide">Controller Bluetooth</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>

            <button
              onClick={() => setActiveTab("udev")}
              className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                activeTab === "udev" 
                  ? "bg-amber-500 text-neutral-950 font-bold" 
                  : "hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Code className="w-4 h-4" />
                <span className="text-xs font-mono uppercase tracking-wide">UDEV Device Rules</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>
          </div>

        </div>

        {/* Right Column: Dynamic Action Workspace */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* TAB: AUTOPILOT SETUP & AUTOMATION */}
          {activeTab === "installation" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 shadow-xl">
              
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                    <Download className="w-5 h-5 text-amber-500 animate-bounce" />
                    OpenVriver Complete Autopilot Installer
                  </h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    An elegant, modular bash script that automatically compiles the hardware gateway, copies the library to the SteamVR drivers structure, binds required system permissions, and configures headset-free Virtual HMD properties.
                  </p>
                </div>
                <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded">
                  One-Click Autopilot
                </div>
              </div>

              {/* What the script automates (Interactive Checklist) */}
              <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-5 flex flex-col gap-4">
                <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                  What This Setup Script Automates:
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="flex gap-3 items-start bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold shrink-0">1</div>
                    <div>
                      <p className="font-semibold text-neutral-200">Resolves Dependencies</p>
                      <p className="text-neutral-400 mt-0.5 leading-relaxed">Checks and installs standard packages: libfreenect, bluez-utils, and development tools via your package manager.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold shrink-0">2</div>
                    <div>
                      <p className="font-semibold text-neutral-200">Automates CMake Compilation</p>
                      <p className="text-neutral-400 mt-0.5 leading-relaxed">Compiles the C++ hardware translator and standard driver .so modules for target architecture.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold shrink-0">3</div>
                    <div>
                      <p className="font-semibold text-neutral-200">Registers SteamVR Driver</p>
                      <p className="text-neutral-400 mt-0.5 leading-relaxed">Locates SteamVR directory structure and sets up local openvriver path registration automatically.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 items-start bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/60">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold shrink-0">4</div>
                    <div>
                      <p className="font-semibold text-neutral-200">Configures Virtual HMD Mode</p>
                      <p className="text-neutral-400 mt-0.5 leading-relaxed">Patches SteamVR settings to disable physical HMD check (`requireHmd: false`) allowing direct gameplay with controllers only.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source code viewer for the Installer */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                    openvriver-setup.sh (Official Code)
                  </span>
                  {sourceFiles["openvriver-setup.sh"] && (
                    <button
                      onClick={() => handleCopyCode("openvriver-setup.sh", sourceFiles["openvriver-setup.sh"])}
                      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {copiedFile === "openvriver-setup.sh" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Setup Script</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 font-mono text-xs overflow-x-auto max-h-96 text-neutral-350 leading-relaxed">
                  <pre>{sourceFiles["openvriver-setup.sh"] || "# Loading installer code..."}</pre>
                </div>
              </div>

            </div>
          )}

          {/* TAB: VIRTUAL HMD EMULATOR DASHBOARD */}
          {activeTab === "hmd" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 shadow-xl">
              
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-amber-500" />
                  Virtual HMD (No-Headset Mode) Simulation
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Don't have a VR headset? No problem. OpenVriver tricks SteamVR into starting anyway. The headset translation (position) is mapped dynamically via Kinect depth, and rotation is bound to the Wiimote/Joycon's IMU sensors!
                </p>
              </div>

              {/* Interactive Virtual Headset HUD & Controllers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Visual Emulator Screen representing 3D transformation */}
                <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-5 flex flex-col items-center justify-center relative min-h-[250px] overflow-hidden">
                  
                  {/* Grid canvas */}
                  <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]"></div>
                  
                  {/* Outer boundaries */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-mono text-neutral-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    <span>LIVE ENGINE VIEW</span>
                  </div>

                  {/* 3D simulated Virtual Headset representing rotations */}
                  <div 
                    className="w-28 h-20 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-950 border-2 border-amber-500/80 shadow-[0_0_25px_rgba(245,158,11,0.15)] flex flex-col justify-between p-3 relative z-10 transition-transform duration-100"
                    style={{
                      transform: `perspective(400px) rotateX(${hmdPitch}deg) rotateY(${hmdYaw}deg) rotateZ(${hmdRoll}deg) translate3d(${hmdX * 20}px, ${(hmdY - 1.7) * 20}px, 0px)`
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="text-[9px] font-mono text-neutral-400 uppercase">OVR-VHMD</span>
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    </div>
                    
                    <div className="h-0.5 bg-amber-500/40 rounded-full my-1"></div>

                    <div className="flex justify-between items-center text-[8px] font-mono text-neutral-500">
                      <span>POS: {hmdX.toFixed(2)}, {hmdY.toFixed(2)}</span>
                      <span>ROT: {hmdYaw}°</span>
                    </div>
                  </div>

                  <p className="text-[10px] font-mono text-neutral-500 mt-6 text-center leading-normal max-w-[280px]">
                    Drag the emulator sliders on the right to simulate physical Wiimote/Joy-Con rotations and Kinect positions inside the driver framework.
                  </p>
                </div>

                {/* Simulated telemetry controls */}
                <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-5 flex flex-col gap-4">
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    Orientation & Skeletal Emulators
                  </h3>

                  {/* Rotations (Emulating Bluetooth Controller) */}
                  <div className="flex flex-col gap-3">
                    <div className="text-xs font-semibold text-neutral-300 font-mono">
                      Emulate Controller IMU Rotations (HMD)
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                        <span>Yaw (Left/Right)</span>
                        <span className="text-amber-400 font-bold">{hmdYaw}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="-90" 
                        max="90" 
                        value={hmdYaw} 
                        onChange={(e) => setHmdYaw(Number(e.target.value))}
                        className="w-full accent-amber-500" 
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                        <span>Pitch (Up/Down)</span>
                        <span className="text-amber-400 font-bold">{hmdPitch}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="-45" 
                        max="45" 
                        value={hmdPitch} 
                        onChange={(e) => setHmdPitch(Number(e.target.value))}
                        className="w-full accent-amber-500" 
                      />
                    </div>
                  </div>

                  {/* Positional Translation (Emulating Kinect Spine Joint) */}
                  <div className="flex flex-col gap-3 border-t border-neutral-900 pt-3">
                    <div className="text-xs font-semibold text-neutral-300 font-mono">
                      Emulate Kinect Positional Tracking
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                        <span>Physical Head Height (Y)</span>
                        <span className="text-amber-400 font-bold">{hmdY.toFixed(2)}m</span>
                      </div>
                      <input 
                        type="range" 
                        min="1.0" 
                        max="2.2" 
                        step="0.05"
                        value={hmdY} 
                        onChange={(e) => setHmdY(Number(e.target.value))}
                        className="w-full accent-amber-500" 
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                        <span>Lateral Shift (X)</span>
                        <span className="text-amber-400 font-bold">{hmdX.toFixed(2)}m</span>
                      </div>
                      <input 
                        type="range" 
                        min="-1.5" 
                        max="1.5" 
                        step="0.05"
                        value={hmdX} 
                        onChange={(e) => setHmdX(Number(e.target.value))}
                        className="w-full accent-amber-500" 
                      />
                    </div>
                  </div>

                </div>

              </div>

              {/* Source code reference for the Virtual HMD Driver */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                    driver/virtual_hmd_driver.cpp (Source Snippet)
                  </span>
                  {sourceFiles["virtual_hmd_driver.cpp"] && (
                    <button
                      onClick={() => handleCopyCode("virtual_hmd_driver.cpp", sourceFiles["virtual_hmd_driver.cpp"])}
                      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {copiedFile === "virtual_hmd_driver.cpp" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy File</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 font-mono text-xs overflow-x-auto max-h-72 text-neutral-300">
                  <pre className="leading-relaxed">
                    {sourceFiles["virtual_hmd_driver.cpp"] || "// Loading Virtual HMD driver source..."}
                  </pre>
                </div>
              </div>

            </div>
          )}

          {/* TAB: KINECT SKELETAL DRIVER DETAILS */}
          {activeTab === "driver" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 shadow-xl">
              
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-amber-500" />
                  Kinect Full Body Tracking Driver (libfreenect)
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Using libfreenect to fetch raw spatial depth data, extracting core coordinates, and compiling three unique physical VR trackers (Hip, Left Foot, Right Foot) into the SteamVR environment.
                </p>
              </div>

              {/* Coordinates display matrix */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-mono text-neutral-400">Waist Tracker</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">ID: SPINE</span>
                  </div>
                  <div className="font-mono flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">X-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.spine.x.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Y-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.spine.y.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Z-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.spine.z.toFixed(3)}m</span>
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-mono text-neutral-400">Left Foot</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">ID: LFOOT</span>
                  </div>
                  <div className="font-mono flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">X-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.left_foot.x.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Y-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.left_foot.y.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Z-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.left_foot.z.toFixed(3)}m</span>
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-mono text-neutral-400">Right Foot</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">ID: RFOOT</span>
                  </div>
                  <div className="font-mono flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">X-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.right_foot.x.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Y-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.right_foot.y.toFixed(3)}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Z-Pos:</span>
                      <span className="text-neutral-200 font-semibold">{trackingCoordinates.right_foot.z.toFixed(3)}m</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Source code reference for tracking daemon */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                    driver_openvriver.cpp (Main Tracker Source)
                  </span>
                  {sourceFiles["driver_openvriver.cpp"] && (
                    <button
                      onClick={() => handleCopyCode("driver_openvriver.cpp", sourceFiles["driver_openvriver.cpp"])}
                      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {copiedFile === "driver_openvriver.cpp" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy File</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 font-mono text-xs overflow-x-auto max-h-72 text-neutral-300">
                  <pre className="leading-relaxed">
                    {sourceFiles["driver_openvriver.cpp"] || "// Loading main driver source..."}
                  </pre>
                </div>
              </div>

            </div>
          )}

          {/* TAB: BLUETOOTH PAIRINGS */}
          {activeTab === "controller" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 shadow-xl">
              
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-amber-500" />
                  Wii Remote & Nintendo Switch Joy-Con Pairing Hub
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Connect Joy-Cons or Wiimote controllers over Bluetooth. The OpenVriver daemon binds their input events directly to emulate standard OpenVR index or vive controller models.
                </p>
              </div>

              {/* Step-by-step physical Bluetooth pairing */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="bg-neutral-950 p-5 rounded-xl border border-neutral-850 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-neutral-300 font-mono flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    Wii Remote & Nunchuck pairing
                  </h3>
                  <ol className="text-xs text-neutral-400 flex flex-col gap-3 leading-relaxed list-decimal pl-4">
                    <li>
                      Put your Wii Remote in pairing mode by pressing the red **SYNC** button under the battery cover.
                    </li>
                    <li>
                      Run the terminal command on your Linux host:
                      <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800 mt-1.5 font-mono text-[10px] text-amber-400 leading-normal">
                        bluetoothctl --power on<br/>
                        scan on<br/>
                        pair [WIIMOTE_MAC]<br/>
                        trust [WIIMOTE_MAC]<br/>
                        connect [WIIMOTE_MAC]
                      </div>
                    </li>
                    <li>
                      Plug in the Nunchuck accessory. OpenVriver maps the analog stick directly to SteamVR movement coordinates.
                    </li>
                  </ol>
                </div>

                <div className="bg-neutral-950 p-5 rounded-xl border border-neutral-850 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-neutral-300 font-mono flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    Joy-Con L & R Bluetooth pairing
                  </h3>
                  <ol className="text-xs text-neutral-400 flex flex-col gap-3 leading-relaxed list-decimal pl-4">
                    <li>
                      Hold the round **SYNC** button on both Left and Right Joy-Cons until the green lights begin tracking.
                    </li>
                    <li>
                      Expose the MAC addresses and link both components:
                      <div className="bg-neutral-900 p-2.5 rounded border border-neutral-800 mt-1.5 font-mono text-[10px] text-rose-400 leading-normal">
                        pair [JOYCON_L_MAC]<br/>
                        trust [JOYCON_L_MAC]<br/>
                        pair [JOYCON_R_MAC]<br/>
                        trust [JOYCON_R_MAC]
                      </div>
                    </li>
                    <li>
                      OpenVriver integrates both separate controllers into one virtual body mapping framework seamlessly.
                    </li>
                  </ol>
                </div>

              </div>

              {/* Standard active BlueZ socket configuration */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850 font-mono text-xs flex flex-col gap-2.5">
                <span className="text-neutral-400 font-semibold">Active Button Mapping Profiles</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1.5 text-neutral-300 text-center">
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider mb-1">Trigger</span>
                    <span className="text-neutral-200">Joycon ZR / ZL</span>
                  </div>
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider mb-1">Grip Button</span>
                    <span className="text-neutral-200">Joycon L / R</span>
                  </div>
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider mb-1">Dashboard</span>
                    <span className="text-neutral-200">Wiimote B Button</span>
                  </div>
                  <div className="bg-neutral-900 p-2 rounded border border-neutral-800">
                    <span className="text-neutral-500 block text-[9px] uppercase tracking-wider mb-1">Calibration</span>
                    <span className="text-neutral-200">Wii Home / Sync</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB: UDEV DEVICE PERMISSIONS */}
          {activeTab === "udev" && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col gap-6 shadow-xl">
              
              <div>
                <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                  <Code className="w-5 h-5 text-amber-500" />
                  UDEV Rules configuration (99-openvriver.rules)
                </h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Without appropriate udev rules, Linux blocks access to physical USB Kinect controllers and HID Raw Bluetooth Joycons. You must register these rules on your system.
                </p>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg flex gap-3 text-xs">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-amber-200 font-semibold leading-normal">Installation Path:</p>
                  <p className="text-neutral-400 leading-normal mt-0.5">
                    Save the udev rule file below into <span className="font-mono bg-neutral-950 text-amber-300 px-1 py-0.5 rounded">/etc/udev/rules.d/99-openvriver.rules</span> on your host machine, then reload rules.
                  </p>
                </div>
              </div>

              {/* Copiable Code Block */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                    /etc/udev/rules.d/99-openvriver.rules
                  </span>
                  {sourceFiles["99-openvriver.rules"] && (
                    <button
                      onClick={() => handleCopyCode("99-openvriver.rules", sourceFiles["99-openvriver.rules"])}
                      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {copiedFile === "99-openvriver.rules" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Rules</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-850 font-mono text-xs overflow-x-auto text-neutral-300">
                  <pre className="leading-relaxed">
                    {sourceFiles["99-openvriver.rules"] || "# Loading rules..."}
                  </pre>
                </div>
              </div>

              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850 flex flex-col gap-2 font-mono text-xs text-neutral-300">
                <span className="text-neutral-400 font-semibold">How to reload udev daemon on Ubuntu or Arch:</span>
                <div className="bg-neutral-900 p-3 rounded mt-1 border border-neutral-800">
                  <code>sudo udevadm control --reload-rules && sudo udevadm trigger</code>
                </div>
                <p className="text-[11px] text-neutral-500 leading-normal mt-1">
                  Grants user access permissions (mode 0666) to Kinect audio, depth camera streams, and hidraw game controllers without needing root to launch SteamVR or the openvriver daemon.
                </p>
              </div>

            </div>
          )}

        </div>

      </main>

      {/* Footer bar */}
      <footer id="footer-bar" className="border-t border-neutral-900 px-6 py-4 mt-auto bg-neutral-950/40 text-center text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
          <span className="flex items-center gap-1">
            OpenVriver Project is free, open-source software licensed under GPLv3. Created with <Heart className="w-3 h-3 text-amber-500 fill-amber-500" /> for the Linux VR Community.
          </span>
          <div className="flex gap-4">
            <a href="#repo" onClick={() => setActiveTab("installation")} className="hover:text-neutral-300 transition-colors">GitHub Repository</a>
            <span>•</span>
            <a href="#wiki" onClick={() => setActiveTab("driver")} className="hover:text-neutral-350 transition-colors">SteamVR Driver Docs</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
