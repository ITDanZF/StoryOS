using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

internal static class StoryOSSetup
{
    private static int Main()
    {
        var destination = Path.Combine(Path.GetTempPath(), "StoryOS-1.0.0.msi");
        using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("StoryOS.msi"))
        {
            if (source == null)
            {
                Console.Error.WriteLine("找不到内嵌的安装包。");
                return 1;
            }

            using (var output = File.Create(destination))
            {
                source.CopyTo(output);
            }
        }

        var installer = Process.Start(new ProcessStartInfo
        {
            FileName = "msiexec.exe",
            Arguments = "/i \"" + destination + "\"",
            UseShellExecute = true,
        });
        if (installer == null)
        {
            return 1;
        }

        installer.WaitForExit();
        try
        {
            File.Delete(destination);
        }
        catch (IOException)
        {
        }

        return installer.ExitCode;
    }
}
