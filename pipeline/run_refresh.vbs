Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""C:\Users\Louise\my-app\pipeline\run_refresh.bat"" " & WScript.Arguments(0), 0, False
