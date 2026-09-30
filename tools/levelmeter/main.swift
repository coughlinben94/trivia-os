// levelmeter: records ONE app's output audio (no driver) via Core Audio process taps
// and writes raw float32 PCM + a JSON summary. Usage:
//   levelmeter <match> <seconds> <outPrefix>
// <match> = case-insensitive substring of bundle id or process name (e.g. "spotify", "chrome").
import Foundation
import CoreAudio
import AudioToolbox
import Darwin

func fail(_ m: String) -> Never { FileHandle.standardError.write(Data(("ERR " + m + "\n").utf8)); exit(2) }

func sysAddr(_ sel: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}
func getU32(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> UInt32? {
    var a = sysAddr(sel); var v: UInt32 = 0; var s = UInt32(MemoryLayout<UInt32>.size)
    return AudioObjectGetPropertyData(obj, &a, 0, nil, &s, &v) == noErr ? v : nil
}
func getString(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String? {
    var a = sysAddr(sel); var v: Unmanaged<CFString>? = nil; var s = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(obj, &a, 0, nil, &s, &v) == noErr, let cf = v else { return nil }
    return cf.takeRetainedValue() as String
}
func procName(_ pid: pid_t) -> String {
    var buf = [CChar](repeating: 0, count: 256)
    proc_name(pid, &buf, UInt32(buf.count))
    return String(cString: buf)
}

let args = CommandLine.arguments
guard args.count >= 4, let seconds = Double(args[2]) else { fail("usage: levelmeter <match> <seconds> <outPrefix>") }
let match = args[1].lowercased()
let outPrefix = args[3]

// 1. find matching audio processes
var listAddr = sysAddr(kAudioHardwarePropertyProcessObjectList)
var listSize: UInt32 = 0
guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &listAddr, 0, nil, &listSize) == noErr else { fail("process list size") }
var procIDs = [AudioObjectID](repeating: 0, count: Int(listSize) / MemoryLayout<AudioObjectID>.size)
guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &listAddr, 0, nil, &listSize, &procIDs) == noErr else { fail("process list") }

var matched: [AudioObjectID] = []
var matchedDesc: [String] = []
for id in procIDs {
    let bundle = (getString(id, kAudioProcessPropertyBundleID) ?? "")
    let pid = pid_t(getU32(id, kAudioProcessPropertyPID) ?? 0)
    let name = procName(pid)
    if bundle.lowercased().contains(match) || name.lowercased().contains(match) {
        matched.append(id)
        let running = getU32(id, kAudioProcessPropertyIsRunningOutput) ?? 0
        matchedDesc.append("\(name)[\(bundle)] pid=\(pid) outputting=\(running)")
    }
}
if matched.isEmpty { fail("no audio process matches '\(match)' (is it playing?)") }

// 2. tap + aggregate device
let desc = CATapDescription(stereoMixdownOfProcesses: matched)
desc.uuid = UUID()
desc.muteBehavior = .unmuted
var tapID: AudioObjectID = 0
var err = AudioHardwareCreateProcessTap(desc, &tapID)
guard err == noErr else { fail("create tap failed \(err) (permission denied?)") }

var outAddr = sysAddr(kAudioHardwarePropertyDefaultSystemOutputDevice)
var outDev: AudioDeviceID = 0; var sz = UInt32(MemoryLayout<AudioDeviceID>.size)
guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &outAddr, 0, nil, &sz, &outDev) == noErr else { fail("default output") }
guard let outUID = getString(outDev, kAudioDevicePropertyDeviceUID) else { fail("output uid") }

var fmtAddr = sysAddr(kAudioTapPropertyFormat)
var asbd = AudioStreamBasicDescription(); var asz = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
guard AudioObjectGetPropertyData(tapID, &fmtAddr, 0, nil, &asz, &asbd) == noErr else { fail("tap format") }

let aggUID = UUID().uuidString
let aggDesc: [String: Any] = [
    kAudioAggregateDeviceNameKey: "levelmeter-tap",
    kAudioAggregateDeviceUIDKey: aggUID,
    kAudioAggregateDeviceMainSubDeviceKey: outUID,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceIsStackedKey: false,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outUID]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: desc.uuid.uuidString]],
]
var aggID: AudioObjectID = 0
err = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &aggID)
guard err == noErr else { fail("create aggregate failed \(err)") }

// 3. record
let rawPath = outPrefix + ".f32"
FileManager.default.createFile(atPath: rawPath, contents: nil)
guard let fh = FileHandle(forWritingAtPath: rawPath) else { fail("open \(rawPath)") }
let channels = Int(asbd.mChannelsPerFrame)
var frames = 0, nonZeroFrames = 0
var peak: Float = 0, sumSq: Double = 0, nSamples: Double = 0
let q = DispatchQueue(label: "levelmeter.io")
var procID: AudioDeviceIOProcID?
err = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, q) { _, inData, _, _, _ in
    let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
    if abl.count == 1, let d = abl[0].mData {
        let n = Int(abl[0].mDataByteSize) / 4
        let p = d.assumingMemoryBound(to: Float.self)
        var nz = false
        for i in 0..<n { let v = p[i]; let a = abs(v); if a > peak { peak = a }; sumSq += Double(v * v); if a > 1e-7 { nz = true } }
        nSamples += Double(n); frames += n / max(channels, 1); if nz { nonZeroFrames += n / max(channels, 1) }
        fh.write(Data(bytes: d, count: Int(abl[0].mDataByteSize)))
    } else if abl.count > 1 {
        // planar: interleave
        let n = Int(abl[0].mDataByteSize) / 4
        var out = [Float](repeating: 0, count: n * abl.count)
        var nz = false
        for c in 0..<abl.count { if let d = abl[c].mData { let p = d.assumingMemoryBound(to: Float.self)
            for i in 0..<n { let v = p[i]; out[i * abl.count + c] = v; let a = abs(v); if a > peak { peak = a }; sumSq += Double(v * v); if a > 1e-7 { nz = true } } } }
        nSamples += Double(n * abl.count); frames += n; if nz { nonZeroFrames += n }
        out.withUnsafeBufferPointer { fh.write(Data(buffer: $0)) }
    }
}
guard err == noErr else { fail("create ioproc \(err)") }
guard AudioDeviceStart(aggID, procID) == noErr else { fail("start") }
Thread.sleep(forTimeInterval: seconds)
AudioDeviceStop(aggID, procID)
AudioDeviceDestroyIOProcID(aggID, procID!)
AudioHardwareDestroyAggregateDevice(aggID)
AudioHardwareDestroyProcessTap(tapID)
try? fh.close()

let rms = nSamples > 0 ? sqrt(sumSq / nSamples) : 0
let summary: [String: Any] = [
    "matched": matchedDesc, "sampleRate": asbd.mSampleRate, "channels": channels,
    "frames": frames, "nonZeroFrames": nonZeroFrames, "peak": Double(peak),
    "rmsDb": rms > 0 ? 20 * log10(rms) : -999, "raw": rawPath,
]
let js = try! JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys])
try! js.write(to: URL(fileURLWithPath: outPrefix + ".json"))
print(String(data: js, encoding: .utf8)!)
