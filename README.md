# Cyberpunk 2077 NightCoop

Play local co-op on one PC with two players. Use split-screen on one monitor or give each player their own monitor.

## What you need

- **Cyberpunk 2077 2.5** on Windows. Tested on Steam.
- **Nucleus Co-op 2.4.2**.
- **NightCoop 0.2.1-beta for Cyberpunk 2077 2.5**, build **5a51ea59**, and RED4ext 1.31.0. [Download the required build from NightCoop](https://nightcoop.net/dl/0.2.1-beta/NightCoop-0.2.1-beta-2.5.zip)

## 1. Install NightCoop in Cyberpunk

1. Download the required NightCoop build above and extract the NightCoop ZIP.
2. Copy the **bin**, **red4ext**, and **r6** folders from the NightCoop download into your **Cyberpunk 2077 game folder** so they merge with the folders already there.
3. Open Cyberpunk normally and check that **Co-op** appears on the main menu. Set the game to **Windowed**, then close it.

## 2. Install the handler in Nucleus

1. Extract the handler ZIP. Copy **Cyberpunk2077NightCoopRC.js** and the **Cyberpunk2077NightCoopRC** folder into **Nucleus Co-op → handlers**.
2. Open or restart Nucleus Co-op. Click **Search Game** and select **bin\x64\Cyberpunk2077.exe** from the Cyberpunk installation where you installed NightCoop.

If you used a different Cyberpunk handler before, back up its profiles, remove its game entry from Nucleus, and move its handler script out of the handlers folder before adding this one.

## 3. Start playing

1. Select **Cyberpunk 2077 NightCoop** in Nucleus. Assign each player an Xbox controller or a keyboard and mouse, then drag their devices into their screen region. Put both keyboard and mouse icons in the same region. Check the **P1** and **P2** labels.
2. Click **Next**, set your options, and click **Play**. Nucleus starts Player 1 first, then shows a countdown before starting Player 2.
3. In Cyberpunk, Player 1 opens **Co-op** and hosts. Player 2 joins using the NightCoop invite. The host picks the world and both players mark themselves ready.

**Tested inputs** Two Xbox controllers, or one Xbox controller and one keyboard and mouse. **Experimental** Two keyboard and mouse pairs. Nucleus locks desktop input automatically in this mode. Press **End** by default to return to the desktop, and press it again to resume. If you try two pairs, please report whether each player can move, click, and use menus independently.

## Options

| Option | What it does |
| --- | --- |
| **NightCoop names** | Set each player's name before launch. Blank fields use Nucleus nicknames when enabled, or Player 1 and Player 2. |
| **Frame-rate cap** | Set 30, 45, 60, 90, or 120 FPS per game. **Use game settings** follows each player's own settings. |
| **Graphics preset** | Apply Low, Medium, High, or Ultra to both players for this session. With a preset selected, in-game settings changes stay in temporary copies. **Use game settings** lets you play with and edit each player's regular settings. |
| **Player 2 startup delay** | Wait 0, 5, 10, 15, 20, or 30 seconds after Player 1 finishes booting. The default is 10 seconds. |

Enable **Save Profile** in Nucleus to keep your options with the layout.

## Saves

- **Player 1** uses their regular Cyberpunk saves. Saves made while hosting are available in normal play.
- **Player 2** starts with a separate profile. Saves persist between sessions even when the player's nickname changes.
- To import a character for Player 2, close both games and copy the entire save-slot folder into the guest save location below. Choose a slot that is free in the guest folder.

~~~text
%USERPROFILE%\NucleusCoop\Cyberpunk2077NightCoopRC\Player2\Saved Games\CD Projekt Red\Cyberpunk 2077
~~~

## Quick fixes

- **Window moved or picture stretched?** Keep Nucleus's **Window Merger** off. Close Cyberpunk's graphics settings and press **Ctrl + Alt + F10** to restore the layout and resolution. If the shortcut is unavailable, run **ResetNightCoopWindows.exe --request** from the handler's asset folder while both games are open.
- **Black bars in the main menu?** Cyberpunk shows side bars in its main menu on wide splits. The 3D view can still fill the assigned region.
- **Error about an unsupported build?** Check the versions above. This handler checks the exact Cyberpunk executable, NightCoop DLL, and RED4ext loader at launch.
- **Reporting a problem?** Include the Nucleus log and the affected instance's **red4ext\logs** folder.

## Credits and source

Thanks to the NightCoop and Nucleus Co-op teams. The **source** folder includes the helper code, build scripts, and third-party license notices. Build the DLLs with **build-x64.cmd** from an x64 Visual Studio 2022 Native Tools Command Prompt. The window reset, launch notices, and Options notes helpers have their own **build-*.cmd** scripts. Pass your Nucleus Co-op install folder to **build-options-notes.cmd**.
