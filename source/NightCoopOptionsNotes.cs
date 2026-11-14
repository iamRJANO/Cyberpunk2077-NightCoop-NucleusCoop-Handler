using System;
using System.Drawing;
using System.Windows.Forms;
using Nucleus.Coop;
using Nucleus.Coop.UI;
using Nucleus.Gaming;
using Nucleus.Gaming.Coop;
using Nucleus.Gaming.Controls.SetupScreen;

namespace NightCoop.Handler
{
    public sealed class OptionsNotes
    {
        private static string handlerGuid;
        private static Control setupPanel;

        public void Install(string guid)
        {
            Control panel = UI_Interface.SetupPanel;
            if (panel == null || panel == setupPanel)
                return;

            handlerGuid = guid;
            setupPanel = panel;
            panel.ControlRemoved += SeedSavedOptions;
            panel.ControlAdded += ShowNotes;
        }

        private static bool IsNightCoopSelected()
        {
            return GameProfile.Game != null && GameProfile.Game.GUID == handlerGuid;
        }

        private static void SeedSavedOptions(object sender, ControlEventArgs args)
        {
            // GoToStep removes the device screen before initializing Options.
            if (!(args.Control is SetupScreenControl) || !IsNightCoopSelected() ||
                GameProfile.Instance == null || GameProfile.Instance.Options == null)
                return;

            var values = GameProfile.Instance.Options;
            foreach (var option in GameProfile.Game.Options)
            {
                if (!values.ContainsKey(option.Key))
                    values.Add(option.Key, option.List.Count == 0 ? option.Value : option.List[0]);
            }
        }

        private static void ShowNotes(object sender, ControlEventArgs args)
        {
            var options = args.Control as PlayerOptionsControl;
            if (options == null || !IsNightCoopSelected())
                return;

            foreach (Control control in options.Controls)
            {
                var list = control as ControlListBox;
                if (list == null || list.Controls.ContainsKey("NightCoopOptionsNotes"))
                    continue;

                var optionTitle = list.Controls.Count > 0 && list.Controls[0].Controls.Count > 0
                    ? list.Controls[0].Controls[0] as Label
                    : null;
                var notes = new NotesRow(list.Width, optionTitle == null ? list.Font : optionTitle.Font);
                list.Controls.Add(notes);
                list.Controls.SetChildIndex(notes, 0);
                list.UpdateSizes();
                break;
            }
        }

        private sealed class NotesRow : Panel
        {
            private readonly Font bodyFont;
            private readonly Label heading = new Label
            {
                AutoSize = true,
                Text = "About these options"
            };
            private readonly Label details = new Label
            {
                AutoSize = true,
                Text = "Set your co-op names, choose graphics and FPS for both games, and give Player 1 time to boot before Player 2 starts."
            };

            public NotesRow(int width, Font titleFont)
            {
                Name = "NightCoopOptionsNotes";
                BackColor = Color.Transparent;
                TabStop = false;
                bodyFont = new Font(titleFont, FontStyle.Regular);
                heading.Font = titleFont;
                details.Font = bodyFont;
                Width = width;
                Controls.Add(heading);
                Controls.Add(details);
            }

            protected override void OnLayout(LayoutEventArgs e)
            {
                base.OnLayout(e);
                if (heading == null || details == null || heading.Parent != this || details.Parent != this)
                    return;

                const int inset = 10;
                var limit = new Size(Math.Max(1, ClientSize.Width - 2 * inset), 0);
                heading.MaximumSize = limit;
                details.MaximumSize = limit;
                heading.Location = new Point(inset, inset);
                details.Location = new Point(inset, heading.Bottom + 5);
                Height = details.Bottom + inset;
            }

            protected override void Dispose(bool disposing)
            {
                base.Dispose(disposing);
                if (disposing && bodyFont != null)
                    bodyFont.Dispose();
            }
        }
    }
}
