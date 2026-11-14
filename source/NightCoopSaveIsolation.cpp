#include <Windows.h>
#include <ShlObj.h>
#include <intrin.h>
#include <filesystem>
#include <fstream>
#include <string>

#include <MinHook.h>
#include <RED4ext/Common.hpp>
#include <RED4ext/Api/v1/EMainReason.hpp>
#include <RED4ext/Api/v1/PluginInfo.hpp>
#include <RED4ext/Api/v1/Runtime.hpp>

namespace fs = std::filesystem;

namespace
{
using GetKnownFolderPath = decltype(&SHGetKnownFolderPath);
GetKnownFolderPath originalGetKnownFolderPath = nullptr;
std::wstring savedGamesPath;
fs::path logPath;
LONG gameLogged = 0;
LONG modLogged = 0;

void Log(const wchar_t* message)
{
    std::wofstream log(logPath, std::ios::app);
    log << L"PID " << GetCurrentProcessId() << L" " << message << L'\n';
}

void LogCaller(void* address)
{
    HMODULE caller = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                            GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            static_cast<LPCWSTR>(address), &caller))
        return;

    if (caller == GetModuleHandleW(nullptr))
    {
        if (InterlockedExchange(&gameLogged, 1) == 0)
            Log(L"Cyberpunk requested the isolated Saved Games folder");
    }
    else
    {
        wchar_t path[MAX_PATH]{};
        GetModuleFileNameW(caller, path, ARRAYSIZE(path));
        if (_wcsicmp(fs::path(path).filename().c_str(), L"NightCoop.dll") == 0 &&
            InterlockedExchange(&modLogged, 1) == 0)
            Log(L"NightCoop requested the isolated Saved Games folder");
    }
}

HRESULT WINAPI RedirectSavedGames(REFKNOWNFOLDERID folder, DWORD flags, HANDLE token, PWSTR* result)
{
    if (!IsEqualGUID(folder, FOLDERID_SavedGames) || token != nullptr)
        return originalGetKnownFolderPath(folder, flags, token, result);

    if (!result)
        return E_POINTER;
    *result = nullptr;

    const auto bytes = (savedGamesPath.size() + 1) * sizeof(wchar_t);
    auto buffer = static_cast<PWSTR>(CoTaskMemAlloc(bytes));
    if (!buffer)
        return E_OUTOFMEMORY;

    memcpy(buffer, savedGamesPath.c_str(), bytes);
    *result = buffer;
    LogCaller(_ReturnAddress());
    return S_OK;
}

bool Install(HMODULE module)
{
    wchar_t path[32768]{};
    const auto length = GetModuleFileNameW(module, path, ARRAYSIZE(path));
    if (!length || length == ARRAYSIZE(path))
        return false;

    const auto directory = fs::path(path).parent_path();
    logPath = directory / L"save-isolation.log";
    std::ifstream config(directory / L"saved-games-path.txt");
    std::string line;
    if (!std::getline(config, line) || line.empty())
    {
        Log(L"Missing saved-games-path.txt");
        return false;
    }

    const auto root = fs::u8path(line);
    std::error_code error;
    if (!root.is_absolute() || root.filename() != L"Saved Games")
    {
        Log(L"Invalid Saved Games path");
        return false;
    }
    fs::create_directories(root / L"CD Projekt Red" / L"Cyberpunk 2077", error);
    if (error)
    {
        Log(L"Could not create the isolated save directory");
        return false;
    }
    savedGamesPath = root.native();

    if (MH_Initialize() != MH_OK)
    {
        Log(L"Could not initialize the save redirect");
        return false;
    }
    void* target = nullptr;
    if (MH_CreateHookApiEx(L"shell32.dll", "SHGetKnownFolderPath", &RedirectSavedGames,
                          reinterpret_cast<void**>(&originalGetKnownFolderPath), &target) != MH_OK ||
        MH_EnableHook(target) != MH_OK)
    {
        MH_Uninitialize();
        Log(L"Could not install the save redirect");
        return false;
    }
    Log(L"Save redirect enabled");
    return true;
}
}

RED4EXT_C_EXPORT bool RED4EXT_CALL Main(HMODULE module, RED4ext::v1::EMainReason reason, const void*)
{
    if (reason == RED4ext::v1::EMainReason::Unload)
        return MH_Uninitialize() == MH_OK;

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
    info->name = L"NightCoop Save Isolation";
    info->author = L"Local Nucleus handler";
    info->version = RED4EXT_V1_SEMVER(1, 0, 0);
    info->runtime = RED4EXT_V1_RUNTIME_VERSION_INDEPENDENT;
    info->sdk = RED4EXT_V1_SEMVER(1, 0, 0);
}

RED4EXT_C_EXPORT uint32_t RED4EXT_CALL Supports()
{
    return 1;
}
