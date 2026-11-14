Game.GameName = "Cyberpunk 2077 NightCoop";
Game.GUID = "Cyberpunk2077NightCoopRC";
Game.ExecutableName = "Cyberpunk2077.exe";
Game.BinariesFolder = "bin\\x64";
Game.WorkingFolder = "bin\\x64";
Game.SteamID = "1091500";
Game.MaxPlayers = 2;
Game.MaxPlayersOneMonitor = 2;
// Use individually assigned raw keyboard/mouse devices rather than the legacy
// single keyboard mode. For each keyboard player, assign both devices to that region.
Game.SupportsKeyboard = false;
Game.SupportsMultipleKeyboardsAndMice = true;
Game.LockInputAtStart = false; // Enabled for two keyboard/mouse pairs in Game.Play.
Game.LockInputToggleKey = 0x23; // End toggles input lock by default.
Game.DrawFakeMouseCursor = false; // Use Cyberpunk's native pointer.
Game.SendNormalMouseInput = false;
Game.SendNormalKeyboardInput = false;
Game.ForwardRawKeyboardInput = false;
Game.ForwardRawMouseInput = false;
Game.SupportsPositioning = true;
Game.HandlerInterval = 100;
// NightCoop waits immediately before launching Player 2.
Game.PauseBetweenStarts = 0;
Game.Description = "First, install the official NightCoop 0.2.1-beta build for Cyberpunk 2077 2.5 (5a51ea59) in your Cyberpunk folder. Download it from https://nightcoop.net/download.html. This handler uses that installation.\r\n\r\nAssign each region one Xbox controller or one keyboard and one mouse. Check the P1 and P2 labels. If both players use keyboard and mouse, Nucleus locks desktop input when setup finishes. In Options, set your co-op names, graphics preset, frame-rate cap, and Player 2 startup delay. Use Windowed mode. Player 1 hosts with their existing saves. Player 2 keeps separate saves and joins with the NightCoop invite.";

var playerNameKeys = ["nightCoopPlayer1Name", "nightCoopPlayer2Name"];
Game.AddOption("Player 1 NightCoop name", "Host. Leave blank to use the Nucleus nickname or Player 1.", playerNameKeys[0], []);
Game.AddOption("Player 2 NightCoop name", "Guest. Leave blank to use the Nucleus nickname or Player 2.", playerNameKeys[1], []);

var frameRateKey = "nightCoopFrameRateCap";
var frameRateChoices = ["Use game settings", "30 FPS", "45 FPS", "60 FPS", "90 FPS", "120 FPS"];
Game.AddOption("Frame-rate cap", "Applies to each game instance for this launch.", frameRateKey, frameRateChoices);

var graphicsPresetKey = "nightCoopGraphicsPreset";
var graphicsPresetChoices = ["Use game settings", "Low", "Medium", "High", "Ultra"];
Game.AddOption("Graphics preset", "Applies Cyberpunk's Quick Preset to both players for this launch.", graphicsPresetKey, graphicsPresetChoices);

var startupDelayKey = "nightCoopStartupDelay";
var startupDelayChoices = ["10 seconds", "0 seconds", "5 seconds", "15 seconds", "20 seconds", "30 seconds"];
Game.AddOption("Player 2 startup delay", "Wait after Player 1 reaches the main menu. Increase it if both games starting close together causes stutter.", startupDelayKey, startupDelayChoices);
if (typeof NightCoopUI !== "undefined" && NightCoopUI.ContainsKey("OptionsNotes")) {
    NightCoopUI["OptionsNotes"].Install(Game.GUID);
}

// Link game assets and install a private RED4ext/NightCoop tree per player.
Game.SymlinkGame = true;
Game.SymlinkExe = false;
Game.DirExclusions = ["red4ext"];
Game.FileSymlinkExclusions = ["winmm.dll"];
Game.KeepSymLinkOnExit = true;

// Player 1 keeps the normal Windows profile. The guest loader sets up Player 2's profile.
Game.UseNucleusEnvironment = false;
Game.UserProfileSavePathNoCopy = true;

Game.NeedsSteamEmulation = false;
Game.UseGoldberg = false;
Game.Hook.CustomDllEnabled = false;
Game.Hook.ForceFocus = false;
Game.Hook.ForceFocusWindowName = "Cyberpunk 2077";
Game.Hook.XInputEnabled = false;
// Nucleus 2.3.0 matches legacy post-hook injections against one-based player slots.
// Slot 0 skips them while leaving startup ProtoInput injection enabled.
Game.PostHookInstances = "0";

// Use injected input hooks rather than replacing DLLs used by RED4ext.
Game.ProtoInput.InjectStartup = true;
Game.ProtoInput.XinputHook = true;
Game.ProtoInput.UseOpenXinput = false;
Game.ProtoInput.DrawFakeCursor = false;
// The verified two-player setup leaves periodic focus messages disabled.
Game.ProtoInput.EnableFocusMessageLoop = false;

Game.Play = function () {
    if (Context.PlayerID === 0) {
        validatePlayers();
        if (!System.IO.File.Exists(launchHelperPath())) {
            throw new Error("Install the matching NightCoop handler asset folder to use the startup delay.");
        }
        // Nucleus can otherwise add its profile-level pause after both launches.
        Nucleus.Coop.GameProfile.PauseBetweenInstanceLaunch = 0;
    }

    configureInput();

    prepareInstance();
    if (Context.PlayerID === 1 && !waitForGuestLaunch()) {
        Handler.End(false);
        return;
    }
    if (Context.PlayerID === 0) {
        showHostLaunchNotice();
    }
};

Game.OnFinishedSetup = function () {
    var helper = Context.ScriptFolder + "\\ResetNightCoopWindows.exe";
    if (!System.IO.File.Exists(helper)) {
        Context.Log("NightCoop window reset unavailable. Install the complete handler asset folder.");
        return;
    }

    var instanceRoot = System.IO.Path.GetDirectoryName(Context.RootFolder);
    var args = ['"' + instanceRoot + '"'];
    for (var i = 0; i < PlayerList.Count; i++) {
        var player = PlayerList[i];
        var bounds = player.MonitorBounds;
        args.push(player.ProcessID, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }
    try {
        Context.StartProcess(helper, args.join(" "), false);
    } catch (error) {
        Context.Log("Could not start the NightCoop window reset helper: " + error);
    }
};

var gameExeHash = "D36E74C47592E9C656AE250078CB40B2BE63C782AF5BFBEFF2280D43E653FAB4";
var loaderHash = "C78308921E6697473B6407BF2A4BA1AC4C157B247031FBCDD91AF5063A52AF7D";
var red4extHash = "58DDFE43766AA91249D11671B55A8323D5EC017F816D847AFFE4B6201DCD0709";
var nightCoopHash = "03C621297FFB5E634E42CCBAE542E7435D237986CA527DC40BD91CD93E68B19A";
var gameSaveFolder = "CD Projekt Red\\Cyberpunk 2077";

function fileHash(path) {
    var stream = System.IO.File.OpenRead(path);
    var sha = new System.Security.Cryptography.SHA256Managed();
    try {
        return System.BitConverter.ToString(sha.ComputeHash(stream)).replace(/-/g, "");
    } finally {
        sha.Dispose();
        stream.Dispose();
    }
}

function requireBuild(path, hash, hint) {
    if (!System.IO.File.Exists(path) || fileHash(path) !== hash) {
        throw new Error(hint);
    }
}

// Check the directory and all its parents before any write into the instance or save folders.
function privateDirectory(path) {
    var directory = new System.IO.DirectoryInfo(path);
    for (var parent = directory; parent !== null; parent = parent.Parent) {
        if (parent.Exists && (Number(parent.Attributes) & 1024) !== 0) {
            throw new Error("Remove the linked directory before launching NightCoop: " + parent.FullName);
        }
    }
    return System.IO.Directory.CreateDirectory(directory.FullName).FullName;
}

function requirePrivateFile(path) {
    var file = new System.IO.FileInfo(path);
    var matches = System.IO.Directory.GetFileSystemEntries(file.DirectoryName, file.Name);
    if (matches.length !== 0 && (Number(file.Attributes) & 1024) !== 0) {
        throw new Error("The NightCoop instance contains a linked file. Rebuild this handler's instance folders: " + path);
    }
}

function installFile(source, target) {
    requirePrivateFile(target);
    if (!System.IO.File.Exists(target) || fileHash(source) !== fileHash(target)) {
        System.IO.File.Copy(source, target, true);
    }
}

function prepareGuestProfile() {
    var profile = Context.NucleusUserRoot + "\\NucleusCoop\\Cyberpunk2077NightCoopRC\\Player2";
    var savedGames = profile + "\\Saved Games";
    if ((savedGames + "\\" + gameSaveFolder).length >= 240 || !/^[a-zA-Z]:\\/.test(savedGames)) {
        throw new Error("NightCoop requires a local guest save folder with a shorter Windows path: " + savedGames);
    }
    privateDirectory(savedGames + "\\" + gameSaveFolder);
    privateDirectory(profile + "\\AppData\\Local");
    privateDirectory(profile + "\\AppData\\Roaming");
    return savedGames;
}

function disablePreviousHostRedirect(red4ext) {
    var oldFolder = red4ext + "\\plugins\\00-SaveIsolation";
    var oldPlugin = oldFolder + "\\NightCoopSaveIsolation.dll";
    if (System.IO.File.Exists(oldPlugin)) {
        privateDirectory(oldFolder);
        requirePrivateFile(oldPlugin);
        System.IO.File.Move(oldPlugin, red4ext + "\\NightCoopSaveIsolation.previous");
    }
}

function prepareGuestLoader(assets, originalBin, bin, red4ext, savedGames) {
    var plugin = privateDirectory(red4ext + "\\plugins\\00-SaveIsolation");
    installEarlyLoader(assets, originalBin, bin);
    installFile(assets + "\\NightCoopSaveIsolation.dll", plugin + "\\NightCoopSaveIsolation.dll");

    var startupConfig = bin + "\\saved-games-path.txt";
    var pluginConfig = plugin + "\\saved-games-path.txt";
    requirePrivateFile(startupConfig);
    requirePrivateFile(pluginConfig);
    System.IO.File.WriteAllText(startupConfig, savedGames);
    System.IO.File.WriteAllText(pluginConfig, savedGames);
}

function installEarlyLoader(assets, originalBin, bin) {
    installFile(originalBin + "\\winmm.dll", bin + "\\RED4extWinmm.dll");
    installFile(assets + "\\winmm.dll", bin + "\\winmm.dll");
}

function prepareGraphicsPreset(slot, bin, savedGames) {
    var preset = Context.Options.ContainsKey(graphicsPresetKey) ? String(Context.Options[graphicsPresetKey]) : "";
    var marker = bin + (slot === 1 ? "\\host-session-local-appdata.txt" : "\\guest-session-local-appdata.txt");
    requirePrivateFile(marker);
    if (graphicsPresetChoices.indexOf(preset) < 1) {
        System.IO.File.Delete(marker);
        return false;
    }

    var json = Context.ScriptFolder + "\\GraphicsPresets.json";
    if (!System.IO.File.Exists(json)) {
        throw new Error("Install the matching NightCoop handler asset folder to use graphics presets.");
    }
    var presets = JSON.parse(String(System.IO.File.ReadAllText(json)));
    var appData = slot === 1 ? System.Environment.GetEnvironmentVariable("LOCALAPPDATA") :
        System.IO.Path.GetDirectoryName(savedGames) + "\\AppData\\Local";
    if (!appData) {
        throw new Error("Windows did not provide a Local AppData folder for the NightCoop graphics preset.");
    }
    var subfolder = "\\CD Projekt Red\\Cyberpunk 2077";
    var settingsFile = "\\UserSettings.json";
    var source = appData + subfolder + settingsFile;
    var settings = { version: presets.version, data: [] };
    if (System.IO.File.Exists(source)) {
        try {
            settings = JSON.parse(String(System.IO.File.ReadAllText(source)));
            if (!settings || !Array.isArray(settings.data)) {
                throw new Error("Missing settings groups");
            }
        } catch (error) {
            throw new Error("Could not read Player " + slot + "'s Cyberpunk settings. Select Use game settings in Nucleus or repair " + source);
        }
    }
    applyGraphicsPreset(settings, presets[preset]);

    var local = System.IO.Path.GetFullPath(Context.RootFolder + "\\NightCoopSession\\LocalAppData");
    if ((local + subfolder + settingsFile).length >= 260 || !/^[a-zA-Z]:\\/.test(local)) {
        throw new Error("NightCoop requires a shorter local instance path to use graphics presets: " + local);
    }
    var target = privateDirectory(local + subfolder) + settingsFile;
    requirePrivateFile(target);
    System.IO.File.WriteAllText(target, serializeCyberpunkSettings(settings));
    System.IO.File.WriteAllText(marker, local);
    Context.Log("Player " + slot + " graphics preset: " + preset);
    return true;
}

function applyGraphicsPreset(settings, presetGroups) {
    var groups = Object.create(null);
    settings.data.forEach(function (group) {
        groups[group.group_name] = group;
    });
    presetGroups.forEach(function (presetGroup) {
        var group = groups[presetGroup.group_name];
        if (!group) {
            settings.data.push(presetGroup);
            return;
        }
        var options = Object.create(null);
        group.options.forEach(function (option) {
            options[option.name] = option;
        });
        presetGroup.options.forEach(function (presetOption) {
            var option = options[presetOption.name];
            if (!option) {
                group.options.push(presetOption);
            } else {
                option.value = presetOption.value;
                if (typeof presetOption.index !== "undefined") {
                    option.index = presetOption.index;
                }
            }
        });
    });
}

function serializeCyberpunkSettings(settings) {
    // Cyberpunk distinguishes integer and float JSON tokens, even when the value is whole.
    var floatToken = "__NightCoopFloat_" + System.Guid.NewGuid().ToString("N") + "_";
    function encodeFloat(number) {
        var value = String(number);
        return floatToken + (/[.eE]/.test(value) ? value : value + ".0");
    }
    var json = JSON.stringify(settings, function (key, value) {
        if ((this.type === "float" || this.type === "float_list") && key !== "index" && key !== "default_index") {
            if (typeof value === "number") {
                return encodeFloat(value);
            }
            if (key === "values" && Array.isArray(value)) {
                return value.map(encodeFloat);
            }
        }
        return value;
    }, 2);
    return json.replace(new RegExp('"' + floatToken + '([^"]+)"', "g"), "$1");
}

function isControllerPlayer(player) {
    return player.IsXInput && !player.IsRawMouse && !player.IsRawKeyboard;
}

function isKeyboardMousePlayer(player) {
    return player.IsRawMouse && player.IsRawKeyboard && !player.IsXInput && !player.IsDInput && !player.IsSDL2;
}

function validatePlayers() {
    var assignmentHelp = "Assign each player region one Xbox (XInput) controller or one keyboard and one mouse.";
    if (PlayerList.Count !== 2) {
        throw new Error(assignmentHelp);
    }
    var first = PlayerList[0];
    var second = PlayerList[1];
    var firstPad = isControllerPlayer(first);
    var secondPad = isControllerPlayer(second);
    if (!(firstPad || isKeyboardMousePlayer(first)) || !(secondPad || isKeyboardMousePlayer(second))) {
        throw new Error(assignmentHelp);
    }
    if (firstPad && secondPad && (first.GamepadId < 0 || second.GamepadId < 0 || first.GamepadId === second.GamepadId)) {
        throw new Error("Nucleus needs two distinct XInput controller slots. Press a button on each Xbox controller and assign the two icons again.");
    }
    if (isKeyboardMousePlayer(first) && isKeyboardMousePlayer(second)) {
        var firstMouse = first.RawMouseDeviceHandle.ToInt64();
        var secondMouse = second.RawMouseDeviceHandle.ToInt64();
        var firstKeyboard = first.RawKeyboardDeviceHandle.ToInt64();
        var secondKeyboard = second.RawKeyboardDeviceHandle.ToInt64();
        if (firstMouse === -1 || secondMouse === -1 || firstMouse === secondMouse ||
            firstKeyboard === -1 || secondKeyboard === -1 || firstKeyboard === secondKeyboard) {
            throw new Error("Nucleus needs two distinct keyboards and two distinct mice. Use each device so Nucleus detects it, then assign one keyboard and one mouse to each region.");
        }
    }
}

function configureInput() {
    var controller = isControllerPlayer(Player);
    var twoKeyboardMousePairs = isKeyboardMousePlayer(PlayerList[0]) && isKeyboardMousePlayer(PlayerList[1]);
    var routeInput = controller || twoKeyboardMousePairs;
    var proto = Game.ProtoInput;

    // Nucleus reads these per player before startup injection. A single keyboard
    // and mouse can use native input. Two pairs need per-device routing in both games.
    Game.LockInputAtStart = twoKeyboardMousePairs;
    proto.FreezeExternalInputWhenInputNotLocked = twoKeyboardMousePairs;
    // ProtoInput's default XInput backend can miss a connected second pad.
    proto.UseOpenXinput = isControllerPlayer(PlayerList[0]) && isControllerPlayer(PlayerList[1]);
    proto.RegisterRawInputHook = routeInput;
    proto.GetRawInputDataHook = routeInput;
    proto.MessageFilterHook = routeInput;
    proto.GetCursorPosHook = routeInput;
    proto.SetCursorPosHook = routeInput;
    proto.GetKeyStateHook = routeInput;
    proto.GetAsyncKeyStateHook = routeInput;
    proto.GetKeyboardStateHook = routeInput;
    proto.CursorVisibilityHook = routeInput;
    proto.ClipCursorHook = routeInput;
    proto.RawInputFilter = routeInput;
    proto.MouseMoveFilter = routeInput;
    proto.MouseActivateFilter = routeInput;
    proto.MouseWheelFilter = routeInput;
    proto.MouseButtonFilter = routeInput;
    proto.KeyboardButtonFilter = routeInput;
    proto.SendMouseWheelMessages = routeInput;
    proto.SendMouseButtonMessages = routeInput;
    proto.SendMouseMovementMessages = routeInput;
    proto.SendKeyboardButtonMessages = routeInput;
    proto.FocusHooks = routeInput;

    // Keep both keyboard/mouse games active when Windows shifts focus.
    proto.WindowActivateFilter = twoKeyboardMousePairs;
    proto.WindowActvateAppFilter = twoKeyboardMousePairs;
    proto.BlockedMessages = twoKeyboardMousePairs ? [0x0008] : []; // WM_KILLFOCUS

    if (controller) {
        Context.Log("Input: routed XInput controller " + (Player.GamepadId + 1) +
            (proto.UseOpenXinput ? " via OpenXInput" : ""));
    } else {
        Context.Log(twoKeyboardMousePairs ? "Input: routed assigned keyboard and mouse via ProtoInput" :
            "Input: native keyboard and mouse");
    }
}

function configuredName(index) {
    var key = playerNameKeys[index];
    var value = Context.Options.ContainsKey(key) ? Context.Options[key] : "";
    return String(value || "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
}

function configuredFrameRateIndex() {
    var value = Context.Options.ContainsKey(frameRateKey) ? String(Context.Options[frameRateKey]) : "";
    return Math.max(0, frameRateChoices.indexOf(value));
}

function configuredStartupDelayIndex() {
    var value = Context.Options.ContainsKey(startupDelayKey) ? String(Context.Options[startupDelayKey]) : "";
    return Math.max(0, startupDelayChoices.indexOf(value));
}

function launchHelperPath() {
    return Context.ScriptFolder + "\\NightCoopLaunch.exe";
}

function startLaunchHelper(args) {
    var diagnostics = ", System, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089";
    var Process = System.Type.GetType("System.Diagnostics.Process" + diagnostics);
    return Process.Start(launchHelperPath(), args);
}

function launchRegionArgs(player) {
    var bounds = player.MonitorBounds;
    return [bounds.X, bounds.Y, bounds.Width, bounds.Height].join(" ");
}

function showHostLaunchNotice() {
    var process = startLaunchHelper("--notice " + launchRegionArgs(PlayerList[0]));
    try {
        waitForLaunchHelper(process);
    } finally {
        process.Dispose();
    }
}

function waitForLaunchHelper(process) {
    while (!process.WaitForExit(200)) {
        if (Handler.processingExit) {
            try { process.Kill(); } catch (error) { }
            return false;
        }
    }
    return !Handler.processingExit;
}

function waitForGuestLaunch() {
    var host = PlayerList[0];
    if (host.ProcessID <= 0) {
        Context.Log("Player 1 did not start. Cancelling Player 2 launch.");
        return false;
    }

    var logs = System.IO.Path.GetDirectoryName(Context.RootFolder) + "\\Instance0\\red4ext\\logs";
    var delay = parseInt(startupDelayChoices[configuredStartupDelayIndex()], 10);
    Context.Log("Player 2 startup delay: " + delay + " seconds after Player 1 finishes booting");
    var process = startLaunchHelper("--wait " + host.ProcessID + " " + delay + ' "' + logs + '" ' +
        launchRegionArgs(host));
    try {
        if (!waitForLaunchHelper(process)) {
            return false;
        }
        var result = process.ExitCode;
        if (result === 2) {
            Context.Log("Player 1 closed during startup. Cancelling Player 2 launch.");
            return false;
        }
        if (result !== 0 && result !== 1) {
            throw new Error("NightCoop startup countdown failed (exit code " + result + ").");
        }
        Context.Log(result === 1 ? "Player 1 readiness check timed out; startup countdown finished." :
            "Player 1 reached the main menu and the startup countdown finished.");
        return !Handler.processingExit;
    } finally {
        process.Dispose();
    }
}

function defaultName(index) {
    var slot = index + 1;
    var nativeName = Nucleus.Coop.GameProfile.UseNicknames ? PlayerList[index].Nickname : "";
    var nickname = String(nativeName || "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
    return nickname && nickname !== "Player" + slot ? nickname : "Player " + slot;
}

function prepareInstance() {
    validatePlayers();
    var bounds = Player.MonitorBounds;
    Context.StartArguments = (Context.StartArguments || "") +
        " -width " + bounds.Width + " -height " + bounds.Height;
    Context.Log("Assigned launch resolution: " + bounds.Width + "x" + bounds.Height);
    var frameRateIndex = configuredFrameRateIndex();
    if (frameRateIndex > 0) {
        var cap = parseInt(frameRateChoices[frameRateIndex], 10);
        Context.StartArguments += " -fpsClamp " + cap;
        Context.Log("Frame-rate cap: " + cap + " FPS");
    }

    var source = Context.OrigRootFolder;
    var originalBin = source + "\\bin\\x64";
    var originalRed4ext = source + "\\red4ext";
    var originalMod = originalRed4ext + "\\plugins\\NightCoop";
    var assets = Context.ScriptFolder + "\\SaveIsolation";
    requireBuild(originalBin + "\\Cyberpunk2077.exe", gameExeHash,
        "This candidate requires the compatible Cyberpunk 2077 2.5 executable listed in the README.");
    requireBuild(originalBin + "\\winmm.dll", loaderHash,
        "Install the official NightCoop 0.2.1-beta package for Cyberpunk 2.5 before launching.");
    requireBuild(originalRed4ext + "\\RED4ext.dll", red4extHash,
        "Install the RED4ext 1.31.0 included with the official NightCoop 2.5 package.");
    requireBuild(originalMod + "\\NightCoop.dll", nightCoopHash,
        "Install NightCoop 0.2.1-beta for Cyberpunk 2.5 from nightcoop.net.");
    if (!System.IO.File.Exists(assets + "\\winmm.dll") ||
        !System.IO.File.Exists(assets + "\\NightCoopSaveIsolation.dll")) {
        throw new Error("Install the handler's matching asset folder next to the JS file.");
    }

    var slot = Context.PlayerID + 1;
    if (slot !== 1 && slot !== 2) {
        throw new Error("NightCoop requires two Nucleus player slots.");
    }
    var savedGames = prepareGuestProfile();
    var bin = privateDirectory(Context.RootFolder + "\\bin\\x64");
    requireBuild(bin + "\\Cyberpunk2077.exe", gameExeHash,
        "The instance contains a different Cyberpunk executable. Rebuild this handler's instance folders.");

    var red4ext = privateDirectory(Context.RootFolder + "\\red4ext");
    prepareSplitResolution(red4ext, bounds);
    var mod = privateDirectory(red4ext + "\\plugins\\NightCoop");
    var scripts = privateDirectory(mod + "\\redscript");
    installFile(originalRed4ext + "\\RED4ext.dll", red4ext + "\\RED4ext.dll");
    installFile(originalMod + "\\NightCoop.dll", mod + "\\NightCoop.dll");
    installFile(originalMod + "\\redscript\\NightCoopSdk.reds", scripts + "\\NightCoopSdk.reds");
    installFile(originalMod + "\\redscript\\NightCoopSdkNative.reds", scripts + "\\NightCoopSdkNative.reds");

    var nickname = configuredName(slot - 1) || defaultName(slot - 1);
    var nameFile = mod + "\\name.txt";
    requirePrivateFile(nameFile);
    System.IO.File.WriteAllText(nameFile, nickname);
    var useSessionSettings = prepareGraphicsPreset(slot, bin, savedGames);
    if (slot === 1) {
        disablePreviousHostRedirect(red4ext);
        if (useSessionSettings) {
            installEarlyLoader(assets, originalBin, bin);
        } else {
            installFile(originalBin + "\\winmm.dll", bin + "\\winmm.dll");
        }
        Context.Log("NightCoop Player 1 uses the game's native save folder");
    } else {
        prepareGuestLoader(assets, originalBin, bin, red4ext, savedGames);
        Context.Log("NightCoop Player 2 save folder: " + savedGames + "\\" + gameSaveFolder);
    }
}

function prepareSplitResolution(red4ext, bounds) {
    var source = Context.ScriptFolder + "\\NightCoopSplitResolution.dll";
    if (!System.IO.File.Exists(source)) {
        throw new Error("Install the matching NightCoop handler asset folder.");
    }
    var plugin = privateDirectory(red4ext + "\\plugins\\00-SplitResolution");
    var config = plugin + "\\split-resolution.txt";
    requirePrivateFile(config);
    System.IO.File.WriteAllText(config, bounds.Width + " " + bounds.Height);
    installFile(source, plugin + "\\NightCoopSplitResolution.dll");
}
