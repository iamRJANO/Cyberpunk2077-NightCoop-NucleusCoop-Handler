using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

internal sealed class ResetNightCoopWindows : NativeWindow, IDisposable
{
    private const string EventName = @"Local\Cyberpunk2077NightCoopRC.ResetWindows";
    private const string Title = "Reset NightCoop Windows";
    private const int HotkeyId = 1;
    private const int WmHotkey = 0x0312;
    private const uint ControlAltNoRepeat = 0x4003;
    private const uint F10 = 0x79;
    private const int StyleIndex = -16;
    private const int ExtendedStyleIndex = -20;
    private const int ChildStyle = 0x40000000;
    private const int FrameStyles = 0x00c40000; // WS_CAPTION | WS_THICKFRAME
    private const int ExtendedFrameStyles = 0x00020301; // STATICEDGE | CLIENTEDGE | WINDOWEDGE | DLGMODALFRAME
    private const uint ApplyFrameAndBounds = 0x0434; // NOSENDCHANGING | FRAMECHANGED | NOACTIVATE | NOZORDER
    private const uint AsyncWindowPosition = 0x4000;
    private const uint MoveWithoutResize = 0x4415; // ASYNCWINDOWPOS | NOSENDCHANGING | NOACTIVATE | NOZORDER | NOSIZE
    private const int RestoreWithoutActivation = 4;

    private readonly Process[] games;
    private readonly Rectangle[] regions;
    private readonly EventWaitHandle resetEvent;
    private readonly System.Windows.Forms.Timer timer;
    private readonly bool hotkeyRegistered;
    private readonly Stopwatch startup = Stopwatch.StartNew();

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "--request")
            {
                using (var request = EventWaitHandle.OpenExisting(EventName))
                    request.Set();
                return 0;
            }

            if (args.Length != 11)
                throw new ArgumentException("Start a NightCoop session from Nucleus Co-op first.");

            string instanceRoot = Path.GetFullPath(args[0]);
            using (var host = OpenGame(instanceRoot, args[1], 0))
            using (var guest = OpenGame(instanceRoot, args[6], 1))
            using (var helper = new ResetNightCoopWindows(host, ReadRegion(args, 2), guest, ReadRegion(args, 7)))
                Application.Run();
            return 0;
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            ShowMessage("Start a NightCoop session from Nucleus Co-op first.");
        }
        catch (Exception error)
        {
            ShowMessage(error.Message);
        }
        return 1;
    }

    private static Process OpenGame(string instanceRoot, string pid, int slot)
    {
        string expected = Path.Combine(instanceRoot, "Instance" + slot, "bin", "x64", "Cyberpunk2077.exe");
        var game = Process.GetProcessById(Parse(pid));
        try
        {
            if (!String.Equals(game.MainModule.FileName, expected, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Could not find the running NightCoop Player " + (slot + 1) + " instance.");
            return game;
        }
        catch
        {
            game.Dispose();
            throw;
        }
    }

    private static int Parse(string value)
    {
        return Int32.Parse(value, CultureInfo.InvariantCulture);
    }

    private static Rectangle ReadRegion(string[] args, int start)
    {
        var region = new Rectangle(Parse(args[start]), Parse(args[start + 1]),
            Parse(args[start + 2]), Parse(args[start + 3]));
        if (region.Width <= 0 || region.Height <= 0)
            throw new ArgumentException("Nucleus supplied an invalid player region.");
        return region;
    }

    private ResetNightCoopWindows(Process host, Rectangle hostRegion, Process guest, Rectangle guestRegion)
    {
        games = new[] { host, guest };
        regions = new[] { hostRegion, guestRegion };
        bool created;
        resetEvent = new EventWaitHandle(false, EventResetMode.AutoReset, EventName, out created);
        if (!created)
        {
            resetEvent.Dispose();
            throw new InvalidOperationException("A NightCoop window reset helper is already running.");
        }
        SetThreadDpiAwarenessContext(new IntPtr(-4)); // Per-monitor DPI aware, physical pixels.
        CreateHandle(new CreateParams { Parent = new IntPtr(-3) }); // Message-only window.
        hotkeyRegistered = RegisterHotKey(Handle, HotkeyId, ControlAltNoRepeat, F10);
        timer = new System.Windows.Forms.Timer { Interval = 250 };
        timer.Tick += OnTick;
        timer.Start();
    }

    private void OnTick(object sender, EventArgs args)
    {
        if (games[0].HasExited || games[1].HasExited)
        {
            Application.ExitThread();
            return;
        }
        if (resetEvent.WaitOne(0))
        {
            ResetBothWindows();
            return;
        }
        if (startup.Elapsed < TimeSpan.FromSeconds(15))
            AlignStartupWindows();
    }

    private void AlignStartupWindows()
    {
        for (int player = 0; player < games.Length; player++)
        {
            games[player].Refresh();
            IntPtr window = games[player].MainWindowHandle;
            if (window == IntPtr.Zero || IsIconic(window) || IsZoomed(window) || IsHungAppWindow(window))
                continue;

            int style = GetWindowLong(window, StyleIndex);
            if ((style & ChildStyle) != 0)
                continue;

            // Cyberpunk can re-center or restore the title bar after Nucleus
            // places it. Keep the existing client size in both cases.
            Rect client;
            Point origin = Point.Empty;
            Rectangle region = regions[player];
            if (!GetClientRect(window, out client) || client.Right != region.Width ||
                client.Bottom != region.Height || !ClientToScreen(window, ref origin))
                continue;

            int extendedStyle = GetWindowLong(window, ExtendedStyleIndex);
            if ((style & FrameStyles) != 0 || (extendedStyle & ExtendedFrameStyles) != 0)
            {
                try
                {
                    ApplyBorderlessRegion(window, region, ApplyFrameAndBounds | AsyncWindowPosition);
                }
                catch (Win32Exception)
                {
                    // The game can replace its window during startup. Retry on the next tick.
                }
            }
            else if (origin != region.Location)
            {
                SetWindowPos(window, IntPtr.Zero, region.X, region.Y, 0, 0, MoveWithoutResize);
            }
        }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WmHotkey && message.WParam.ToInt32() == HotkeyId)
        {
            resetEvent.Set();
            return;
        }
        base.WndProc(ref message);
    }

    private void ResetBothWindows()
    {
        timer.Stop();
        try
        {
            var failures = new List<string>();
            for (int player = 0; player < games.Length; player++)
            {
                try
                {
                    string renderWarning = RequestRenderReset(games[player].Id);
                    games[player].Refresh();
                    IntPtr window = games[player].MainWindowHandle;
                    if (window == IntPtr.Zero || IsHungAppWindow(window))
                        throw new InvalidOperationException("The game window is unavailable. Try again when the game responds.");
                    RestoreRegion(window, regions[player]);
                    if (renderWarning != null)
                        failures.Add("Player " + (player + 1) + " - " + renderWarning);
                }
                catch (Exception error)
                {
                    failures.Add("Player " + (player + 1) + " - " + error.Message);
                }
            }
            if (failures.Count > 0)
                ShowMessage(String.Join(Environment.NewLine, failures));
        }
        finally
        {
            timer.Start();
        }
    }

    private static string RequestRenderReset(int pid)
    {
        string prefix = @"Local\Cyberpunk2077NightCoopRC.RenderReset." + pid.ToString(CultureInfo.InvariantCulture);
        EventWaitHandle request;
        if (!EventWaitHandle.TryOpenExisting(prefix + ".Request", out request))
            return "Window layout restored. Relaunch the session if the picture is still stretched.";

        using (request)
        using (var complete = EventWaitHandle.OpenExisting(prefix + ".Complete"))
        {
            complete.Reset();
            request.Set();
            return complete.WaitOne(2000) ? null :
                "Cyberpunk did not confirm a render reset. Close the graphics menu and try again.";
        }
    }

    private static void RestoreRegion(IntPtr window, Rectangle region)
    {
        int style = GetWindowLong(window, StyleIndex);
        if ((style & ChildStyle) != 0)
            throw new InvalidOperationException("Reset NightCoop Windows requires the Nucleus Window Merger to be off.");
        if (IsIconic(window) || IsZoomed(window))
            ShowWindow(window, RestoreWithoutActivation);

        // Applying graphics settings can restore the game's own window size. Skip
        // its pre-resize adjustment and let it process the final size normally.
        for (int attempt = 0; attempt < 4; attempt++)
        {
            ApplyBorderlessRegion(window, region, ApplyFrameAndBounds);
            Thread.Sleep(250);
            if (HasRegion(window, region))
            {
                Thread.Sleep(250);
                if (HasRegion(window, region))
                    return;
            }
        }
        throw new InvalidOperationException("The game did not keep the split size. Close the graphics menu and try again.");
    }

    private static bool HasRegion(IntPtr window, Rectangle region)
    {
        Rect client;
        Point origin = Point.Empty;
        return GetClientRect(window, out client) && ClientToScreen(window, ref origin) &&
            origin == region.Location && client.Right == region.Width && client.Bottom == region.Height;
    }

    private static void ApplyBorderlessRegion(IntPtr window, Rectangle region, uint flags)
    {
        RemoveStyles(window, StyleIndex, FrameStyles);
        RemoveStyles(window, ExtendedStyleIndex, ExtendedFrameStyles);
        if (!SetWindowPos(window, IntPtr.Zero, region.X, region.Y, region.Width, region.Height, flags))
            throw new Win32Exception();
    }

    private static void RemoveStyles(IntPtr window, int index, int mask)
    {
        int style = GetWindowLong(window, index);
        if ((style & mask) == 0)
            return;

        SetLastError(0);
        if (SetWindowLong(window, index, style & ~mask) == 0 &&
            Marshal.GetLastWin32Error() != 0)
            throw new Win32Exception();
    }

    private static void ShowMessage(string message)
    {
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    public void Dispose()
    {
        timer.Dispose();
        if (hotkeyRegistered)
            UnregisterHotKey(Handle, HotkeyId);
        DestroyHandle();
        resetEvent.Dispose();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [DllImport("kernel32.dll")]
    private static extern void SetLastError(uint error);
    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr window, int id);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsHungAppWindow(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr window, ref Point origin);
    // GWL_STYLE and GWL_EXSTYLE are 32-bit values even on 64-bit Windows.
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
    private static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
