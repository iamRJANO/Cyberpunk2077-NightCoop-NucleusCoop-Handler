using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal sealed class NightCoopLaunch : Form
{
    private const string MenuReady = "hud: inkMenuLayer is drawn (its window lays out)";
    private const int ReadinessTimeoutSeconds = 90;
    private readonly Label message;
    private readonly Timer timer = new Timer { Interval = 150 };
    private readonly Stopwatch elapsed = new Stopwatch();
    private readonly Process host;
    private readonly string logs;
    private readonly int delaySeconds;
    private DateTime hostStarted;
    private StreamReader log;
    private string partialLine = "";
    private double? countdownStarted;
    private bool timedOut;

    [STAThread]
    private static int Main(string[] args)
    {
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        Rectangle region;
        if (args.Length == 5 && args[0] == "--notice" && ParseRegion(args, 1, out region))
        {
            using (var notice = new NightCoopLaunch("Launching Player 1", region))
                Application.Run(notice);
            return 0;
        }

        int hostId;
        int delay;
        if (args.Length != 8 || args[0] != "--wait" ||
            !int.TryParse(args[1], out hostId) || !int.TryParse(args[2], out delay) ||
            hostId <= 0 || delay < 0 || delay > 30 || !ParseRegion(args, 4, out region))
            return 3;

        try
        {
            using (var process = Process.GetProcessById(hostId))
            using (var countdown = new NightCoopLaunch("Waiting for Player 1 to finish booting", region, process, delay, args[3]))
            {
                countdown.hostStarted = process.StartTime.ToUniversalTime();
                Application.Run(countdown);
                return countdown.ExitCode;
            }
        }
        catch (ArgumentException)
        {
            return 2;
        }
        catch (InvalidOperationException)
        {
            return 2;
        }
    }

    private static bool ParseRegion(string[] args, int start, out Rectangle region)
    {
        region = Rectangle.Empty;
        int x, y, width, height;
        if (!int.TryParse(args[start], out x) || !int.TryParse(args[start + 1], out y) ||
            !int.TryParse(args[start + 2], out width) || !int.TryParse(args[start + 3], out height) ||
            width <= 0 || height <= 0)
            return false;
        region = new Rectangle(x, y, width, height);
        return true;
    }

    private NightCoopLaunch(string initialMessage, Rectangle region, Process host = null, int delaySeconds = 0, string logs = null)
    {
        this.host = host;
        this.logs = logs;
        this.delaySeconds = delaySeconds;
        ExitCode = 3;

        Text = "NightCoop Startup";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        using (var graphics = Graphics.FromHwnd(IntPtr.Zero))
        {
            float scale = graphics.DpiX / 96f;
            Rectangle area = Rectangle.Intersect(region, Screen.FromRectangle(region).WorkingArea);
            if (area.Width <= 0 || area.Height <= 0)
                area = Screen.PrimaryScreen.WorkingArea;
            ClientSize = new Size(Math.Min(area.Width, (int)(480 * scale)), (int)(84 * scale));
            Location = new Point(area.Left + (area.Width - Width) / 2, area.Top + (int)(32 * scale));
        }

        BackColor = Color.FromArgb(25, 28, 34);
        var heading = new Label
        {
            Dock = DockStyle.Top,
            Height = Height / 2,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.FromArgb(255, 226, 98),
            Text = "NightCoop"
        };
        message = new Label
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(0, 0, 0, 8),
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 14),
            ForeColor = Color.White,
            Text = initialMessage
        };
        Controls.Add(message);
        Controls.Add(heading);

        Shown += delegate
        {
            RaiseWithoutActivation();
            elapsed.Start();
            timer.Start();
        };
        timer.Tick += UpdateStatus;
    }

    private int ExitCode { get; set; }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= 0x08000000 | 0x00000080; // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
            return parameters;
        }
    }

    protected override void WndProc(ref Message args)
    {
        if (args.Msg == 0x0084) // WM_NCHITTEST
        {
            args.Result = new IntPtr(-1); // HTTRANSPARENT
            return;
        }
        base.WndProc(ref args);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            if (log != null)
                log.Dispose();
        }
        base.Dispose(disposing);
    }

    private void UpdateStatus(object sender, EventArgs args)
    {
        double now = elapsed.Elapsed.TotalSeconds;
        if (host == null)
        {
            if (now >= 2)
                Close();
            return;
        }

        if (host.HasExited)
        {
            ExitCode = 2;
            Close();
            return;
        }

        if (!countdownStarted.HasValue)
        {
            bool ready = ReadMenuReady();
            if (!ready && now < ReadinessTimeoutSeconds)
                return;
            timedOut = !ready;
            countdownStarted = now;
        }

        int remaining = (int)Math.Ceiling(delaySeconds - (now - countdownStarted.Value));
        if (remaining <= 0)
        {
            if (message.Text != "Launching Player 2")
            {
                message.Text = "Launching Player 2";
                RaiseWithoutActivation();
            }
            if (now - countdownStarted.Value < delaySeconds + 2)
                return;
            ExitCode = timedOut ? 1 : 0;
            Close();
            return;
        }
        string status = "Launching Player 2 in " + remaining + (remaining == 1 ? " second" : " seconds");
        if (timedOut)
            status = "Startup check timed out. Player 2 in " + remaining + "s";
        if (message.Text != status)
            message.Text = status;
    }

    private void RaiseWithoutActivation()
    {
        const uint keepPositionAndFocus = 0x0013; // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE
        SetWindowPos(Handle, new IntPtr(-1), 0, 0, 0, 0, keepPositionAndFocus);
    }

    private bool ReadMenuReady()
    {
        try
        {
            if (log == null)
            {
                if (!Directory.Exists(logs))
                    return false;
                FileInfo latest = null;
                foreach (FileInfo candidate in new DirectoryInfo(logs).EnumerateFiles("nightcoop-*.log"))
                {
                    if (candidate.LastWriteTimeUtc >= hostStarted &&
                        (latest == null || candidate.LastWriteTimeUtc > latest.LastWriteTimeUtc))
                        latest = candidate;
                }
                if (latest == null)
                    return false;

                log = new StreamReader(latest.Open(FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete));
            }

            string appended = log.ReadToEnd();
            if (appended.Length == 0)
                return false;
            string lines = partialLine + appended;
            int end = lines.LastIndexOf('\n');
            partialLine = lines.Substring(end + 1);
            int marker = lines.IndexOf(MenuReady, StringComparison.Ordinal);
            return marker >= 0 && marker < end;
        }
        catch (IOException)
        {
            return false;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
