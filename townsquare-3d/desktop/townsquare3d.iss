; Townsquare3D for Windows - per-user installer (no admin rights). build.py compiles it with:
;   iscc /DAppVersion=1.0.0 /DSourceDir=<dist\Townsquare3D> /DOutputDir=<dist> /DIconFile=<build\townsquare3d.ico> townsquare3d.iss
; Installs to %LOCALAPPDATA%\Programs\Townsquare3D, adds Townsquare3D to the Start menu (and optionally the desktop) and lists it
; in Settings > Apps. The window keeps its data (what you saved in it) in %LOCALAPPDATA%\Townsquare3D, which
; uninstalling leaves in place so a reinstall finds it again.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "dist\Townsquare3D"
#endif
#ifndef OutputDir
  #define OutputDir "dist"
#endif
#ifndef IconFile
  #define IconFile "build\townsquare3d.ico"
#endif

[Setup]
AppId={{E81247BA-698B-569E-A6DE-E1E1C366EEFB}
AppName=Townsquare3D
AppVersion={#AppVersion}
AppVerName=Townsquare3D {#AppVersion}
AppPublisher=Juwen Lie
AppPublisherURL=https://juw12.github.io/portfolio/townsquare-3d/
AppSupportURL=https://github.com/juw12/portfolio
DefaultDirName={autopf}\Townsquare3D
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=Townsquare3D-Windows-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\Townsquare3D.exe
UninstallDisplayName=Townsquare3D
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Townsquare3D"; Filename: "{app}\Townsquare3D.exe"; Comment: "A shared 3D world you can walk around in from phone or desktop"
Name: "{userdesktop}\Townsquare3D"; Filename: "{app}\Townsquare3D.exe"; Comment: "A shared 3D world you can walk around in from phone or desktop"; Tasks: desktopicon

[Run]
Filename: "{app}\Townsquare3D.exe"; Description: "{cm:LaunchProgram,Townsquare3D}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Townsquare3D.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopTownsquare3D"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  { Updating: close an open Townsquare3D window first so its files can be replaced. }
  if FileExists(ExpandConstant('{app}\Townsquare3D.exe')) then
    Exec(ExpandConstant('{app}\Townsquare3D.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
