#include <Windows.h>
#include <ShlObj.h>
#include <cstring>
#include <cwchar>

namespace
{
using GetKnownFolderPath = decltype(&SHGetKnownFolderPath);
GetKnownFolderPath originalGetKnownFolderPath;
decltype(&SHGetSpecialFolderPathW) originalGetSpecialFolderPath;
wchar_t playerProfile[MAX_PATH];
wchar_t localAppData[MAX_PATH];
wchar_t roamingAppData[MAX_PATH];
wchar_t diagnosticPath[MAX_PATH];
wchar_t savedGames[MAX_PATH];

void Trace(const char* operation)
{
    const HANDLE file = CreateFileW(diagnosticPath, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                                    nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE)
        return;
    DWORD written;
    WriteFile(file, operation, static_cast<DWORD>(strlen(operation)), &written, nullptr);
    CloseHandle(file);
}
// Read a UTF-8 directory next to this instance's loader.
bool ReadDirectory(const wchar_t* folder, const wchar_t* name, wchar_t (&result)[MAX_PATH])
{
    wchar_t path[MAX_PATH]{};
    if (swprintf_s(path, L"%ls\\%ls", folder, name) < 0)
        return false;

    const HANDLE file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                                    FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE)
        return false;

    char text[MAX_PATH * 4]{};
    DWORD count = 0;
    const BOOL read = ReadFile(file, text, sizeof(text) - 1, &count, nullptr);
    CloseHandle(file);
    if (!read || !count || count == sizeof(text) - 1)
        return false;

    text[strcspn(text, "\r\n")] = 0;
    wchar_t directory[MAX_PATH]{};
    const int chars = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, -1,
                                          directory, ARRAYSIZE(directory));
    if (chars <= 4 || directory[1] != L':' || directory[2] != L'\\' ||
        wcsstr(directory, L"\\..\\") != nullptr)
        return false;

    const auto attributes = GetFileAttributesW(directory);
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY) &&
           wcscpy_s(result, directory) == 0;
}

bool ReadGuestProfile(const wchar_t* folder)
{
    if (!ReadDirectory(folder, L"saved-games-path.txt", savedGames))
        return false;
    const auto separator = wcsrchr(savedGames, L'\\');
    if (_wcsicmp(separator + 1, L"Saved Games") != 0 ||
        wcsncpy_s(playerProfile, savedGames, separator - savedGames) != 0 ||
        swprintf_s(roamingAppData, L"%ls\\AppData\\Roaming", playerProfile) < 0)
        return false;

    return ReadDirectory(folder, L"guest-session-local-appdata.txt", localAppData) ||
           swprintf_s(localAppData, L"%ls\\AppData\\Local", playerProfile) > 0;
}

bool SetGuestEnvironment()
{
    const wchar_t drive[] = {playerProfile[0], L':', L'\0'};
    return SetEnvironmentVariableW(L"USERPROFILE", playerProfile) &&
           SetEnvironmentVariableW(L"HOMEDRIVE", drive) &&
           SetEnvironmentVariableW(L"HOMEPATH", playerProfile + 2) &&
           SetEnvironmentVariableW(L"LOCALAPPDATA", localAppData) &&
           SetEnvironmentVariableW(L"APPDATA", roamingAppData);
}

HRESULT WINAPI RedirectSavedGames(REFKNOWNFOLDERID folder, DWORD flags, HANDLE token, PWSTR* result)
{
    if (token != nullptr)
        return originalGetKnownFolderPath(folder, flags, token, result);

    const wchar_t* replacement;
    if (savedGames[0] && IsEqualGUID(folder, FOLDERID_SavedGames))
    {
        replacement = savedGames;
        Trace("SHGetKnownFolderPath SavedGames\r\n");
    }
    else if (playerProfile[0] && IsEqualGUID(folder, FOLDERID_Profile))
    {
        replacement = playerProfile;
        Trace("SHGetKnownFolderPath Profile\r\n");
    }
    else if (IsEqualGUID(folder, FOLDERID_LocalAppData))
        replacement = localAppData;
    else if (roamingAppData[0] && IsEqualGUID(folder, FOLDERID_RoamingAppData))
        replacement = roamingAppData;
    else
        return originalGetKnownFolderPath(folder, flags, token, result);

    if (!result)
        return E_POINTER;
    *result = nullptr;
    const auto bytes = (wcslen(replacement) + 1) * sizeof(wchar_t);
    auto buffer = static_cast<PWSTR>(CoTaskMemAlloc(bytes));
    if (!buffer)
        return E_OUTOFMEMORY;

    memcpy(buffer, replacement, bytes);
    *result = buffer;
    return S_OK;
}

BOOL WINAPI RedirectSpecialFolder(HWND hwnd, LPWSTR path, int folder, BOOL create)
{
    const wchar_t* replacement;
    switch (folder & 0xff)
    {
    case CSIDL_PROFILE:
        replacement = playerProfile;
        break;
    case CSIDL_LOCAL_APPDATA:
        replacement = localAppData;
        break;
    case CSIDL_APPDATA:
        replacement = roamingAppData;
        break;
    default:
        return originalGetSpecialFolderPath(hwnd, path, folder, create);
    }
    if (!replacement[0])
        return originalGetSpecialFolderPath(hwnd, path, folder, create);
    if (!path)
        return FALSE;

    return wcscpy_s(path, MAX_PATH, replacement) == 0;
}

// Redirect only the executable's imports. No thread suspension or system-wide hook.
bool RedirectGameImport(const char* symbol, ULONGLONG replacement, ULONGLONG& original)
{
    auto base = reinterpret_cast<BYTE*>(GetModuleHandleW(nullptr));
    const auto dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE)
        return false;

    const auto nt = reinterpret_cast<IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE ||
        nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC)
        return false;

    const auto imports = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    auto descriptor = reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base + imports.VirtualAddress);
    const auto end = reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base + imports.VirtualAddress + imports.Size);
    for (; descriptor < end && descriptor->Name; ++descriptor)
    {
        if (_stricmp(reinterpret_cast<const char*>(base + descriptor->Name), "SHELL32.dll") != 0)
            continue;
        if (!descriptor->OriginalFirstThunk || !descriptor->FirstThunk)
            return false;

        auto name = reinterpret_cast<const IMAGE_THUNK_DATA64*>(base + descriptor->OriginalFirstThunk);
        auto entry = reinterpret_cast<IMAGE_THUNK_DATA64*>(base + descriptor->FirstThunk);
        for (; name->u1.AddressOfData; ++name, ++entry)
        {
            if (IMAGE_SNAP_BY_ORDINAL64(name->u1.Ordinal))
                continue;
            const auto import = reinterpret_cast<const IMAGE_IMPORT_BY_NAME*>(base + name->u1.AddressOfData);
            if (strcmp(import->Name, symbol) != 0)
                continue;

            DWORD oldProtection;
            if (!VirtualProtect(entry, sizeof(*entry), PAGE_READWRITE, &oldProtection))
                return false;
            original = entry->u1.Function;
            entry->u1.Function = replacement;
            DWORD ignored;
            VirtualProtect(entry, sizeof(*entry), oldProtection, &ignored);
            return true;
        }
        return false;
    }
    return false;
}
}

BOOL WINAPI DllMain(HINSTANCE module, DWORD reason, LPVOID)
{
    if (reason != DLL_PROCESS_ATTACH)
        return TRUE;

    wchar_t folder[MAX_PATH]{};
    const auto length = GetModuleFileNameW(module, folder, ARRAYSIZE(folder));
    if (!length || length >= ARRAYSIZE(folder))
        return FALSE;
    auto separator = wcsrchr(folder, L'\\');
    if (!separator)
        return FALSE;
    *separator = L'\0';
    if (swprintf_s(diagnosticPath, L"%ls\\save-startup.log", folder) < 0)
        return FALSE;

    wchar_t hostMarker[MAX_PATH]{};
    if (swprintf_s(hostMarker, L"%ls\\host-session-local-appdata.txt", folder) < 0)
        return FALSE;
    if (GetFileAttributesW(hostMarker) != INVALID_FILE_ATTRIBUTES)
    {
        if (!ReadDirectory(folder, L"host-session-local-appdata.txt", localAppData) ||
            !SetEnvironmentVariableW(L"LOCALAPPDATA", localAppData))
            return FALSE;
    }
    else if (!ReadGuestProfile(folder) || !SetGuestEnvironment())
        return FALSE;
    ULONGLONG known = 0;
    if (!RedirectGameImport("SHGetKnownFolderPath", reinterpret_cast<ULONGLONG>(&RedirectSavedGames), known))
        return FALSE;
    originalGetKnownFolderPath = reinterpret_cast<GetKnownFolderPath>(known);
    ULONGLONG special = 0;
    if (RedirectGameImport("SHGetSpecialFolderPathW", reinterpret_cast<ULONGLONG>(&RedirectSpecialFolder), special))
        originalGetSpecialFolderPath = reinterpret_cast<decltype(originalGetSpecialFolderPath)>(special);
    return TRUE;
}
