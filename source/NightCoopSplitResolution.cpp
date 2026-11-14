#include <Windows.h>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>

#include <MinHook.h>
#include <RED4ext/Common.hpp>
#include <RED4ext/Api/v1/EMainReason.hpp>
#include <RED4ext/Api/v1/PluginInfo.hpp>
#include <RED4ext/Api/v1/Runtime.hpp>

namespace
{
using ApplyDisplaySettings = void (*)(void*);
ApplyDisplaySettings original;
HANDLE resetRequest;
HANDLE resetComplete;
std::ofstream resetLog;
std::uint32_t width;
std::uint32_t height;

// Steam 2.5: validated by the handler's executable hash and by the function prologue.
constexpr std::uintptr_t applySettingsRva = 0x5d8dd4;
constexpr std::size_t appliedWidthOffset = 0x18;
constexpr std::size_t appliedHeightOffset = 0x1c;
constexpr std::size_t requestedWidthOffset = 0xb0;
constexpr std::size_t requestedHeightOffset = 0xb4;
constexpr std::size_t refreshDisplayOffset = 0x17b;
constexpr unsigned char signature[] = {
    0x40, 0x53, 0x55, 0x56, 0x57, 0x41, 0x54, 0x41, 0x55, 0x41, 0x56, 0x41, 0x57,
    0x48, 0x83, 0xec, 0x38, 0x48, 0x8d, 0x71, 0x38
};

void ApplySplitResolution(void* settings)
{
    auto* data = static_cast<unsigned char*>(settings);
    std::memcpy(data + requestedWidthOffset, &width, sizeof(width));
    std::memcpy(data + requestedHeightOffset, &height, sizeof(height));

    // The normal settings update owns the renderer and window. Request its
    // refresh on that thread, even when the configured dimensions already match.
    const bool reset = WaitForSingleObject(resetRequest, 0) == WAIT_OBJECT_0;
    if (reset)
        data[refreshDisplayOffset] = 1;
    original(settings);
    if (reset)
    {
        std::uint32_t appliedWidth, appliedHeight;
        std::memcpy(&appliedWidth, data + appliedWidthOffset, sizeof(appliedWidth));
        std::memcpy(&appliedHeight, data + appliedHeightOffset, sizeof(appliedHeight));
        resetLog << "PID " << GetCurrentProcessId() << " applied "
                 << appliedWidth << 'x' << appliedHeight << std::endl;
        if (appliedWidth == width && appliedHeight == height)
            SetEvent(resetComplete);
    }
}

void CloseEvents()
{
    if (resetRequest)
        CloseHandle(resetRequest);
    if (resetComplete)
        CloseHandle(resetComplete);
}

bool Install(HMODULE module)
{
    wchar_t modulePath[32768];
    const auto length = GetModuleFileNameW(module, modulePath, ARRAYSIZE(modulePath));
    if (length == 0 || length == ARRAYSIZE(modulePath))
        return false;

    const auto directory = std::filesystem::path(modulePath).parent_path();
    std::ifstream config(directory / L"split-resolution.txt");
    if (!(config >> width >> height) || width == 0 || height == 0 || width > 32767 || height > 32767)
        return false;

    auto* target = reinterpret_cast<unsigned char*>(GetModuleHandleW(nullptr)) + applySettingsRva;
    if (std::memcmp(target, signature, sizeof(signature)) != 0)
        return false;

    resetLog.open(directory / L"split-resolution.log", std::ios::app);
    const auto eventPrefix = L"Local\\Cyberpunk2077NightCoopRC.RenderReset." + std::to_wstring(GetCurrentProcessId());
    resetRequest = CreateEventW(nullptr, FALSE, FALSE, (eventPrefix + L".Request").c_str());
    resetComplete = CreateEventW(nullptr, FALSE, FALSE, (eventPrefix + L".Complete").c_str());
    if (resetRequest && resetComplete && MH_Initialize() == MH_OK)
    {
        if (MH_CreateHook(target, &ApplySplitResolution, reinterpret_cast<void**>(&original)) == MH_OK &&
            MH_EnableHook(target) == MH_OK)
            return true;
        MH_Uninitialize();
    }

    CloseEvents();
    return false;
}
}

RED4EXT_C_EXPORT bool RED4EXT_CALL Main(HMODULE module, RED4ext::v1::EMainReason reason, const void*)
{
    if (reason == RED4ext::v1::EMainReason::Unload)
    {
        if (MH_Uninitialize() != MH_OK)
            return false;
        CloseEvents();
        return true;
    }
    try
    {
        return Install(module);
    }
    catch (const std::exception&)
    {
        return false;
    }
}

RED4EXT_C_EXPORT void RED4EXT_CALL Query(RED4ext::v1::PluginInfo* info)
{
    info->name = L"NightCoop Split Resolution";
    info->author = L"Local Nucleus handler";
    info->version = RED4EXT_V1_SEMVER(1, 0, 0);
    info->runtime = RED4EXT_V1_RUNTIME_VERSION_2_50;
    info->sdk = RED4EXT_V1_SEMVER(1, 0, 0);
}

RED4EXT_C_EXPORT uint32_t RED4EXT_CALL Supports() { return 1; }
