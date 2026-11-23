; CozyIsland for Windows - per-user installer (no admin rights). build.py compiles it with:
;   iscc /DAppVersion=1.0.0 /DSourceDir=<dist\CozyIsland> /DOutputDir=<dist> /DIconFile=<build\game.ico> game.iss
; Installs to %LOCALAPPDATA%\Programs\CozyIsland, adds CozyIsland to the Start menu (and optionally the desktop) and lists it
; in Settings > Apps. The window keeps its data (what you saved in it) in %LOCALAPPDATA%\CozyIsland, which
; uninstalling leaves in place so a reinstall finds it again.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "dist\CozyIsland"
#endif
#ifndef OutputDir
  #define OutputDir "dist"
#endif
#ifndef IconFile
  #define IconFile "build\game.ico"
#endif

[Setup]
AppId={{E81247BA-698B-569E-A6DE-E1E1C366EEFB}
AppName=CozyIsland
AppVersion={#AppVersion}
AppVerName=CozyIsland {#AppVersion}
AppPublisher=Juwen Lie
AppPublisherURL=https://juw12.github.io/portfolio/cozy-island/
AppSupportURL=https://github.com/juw12/portfolio
DefaultDirName={autopf}\CozyIsland
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=CozyIsland-Windows-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\CozyIsland.exe
UninstallDisplayName=CozyIsland
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
Name: "{userprograms}\CozyIsland"; Filename: "{app}\CozyIsland.exe"; Comment: "A cozy 3D island for laptop workers: fish, garden"
Name: "{userdesktop}\CozyIsland"; Filename: "{app}\CozyIsland.exe"; Comment: "A cozy 3D island for laptop workers: fish, garden"; Tasks: desktopicon

[Run]
Filename: "{app}\CozyIsland.exe"; Description: "{cm:LaunchProgram,CozyIsland}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\CozyIsland.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopCozyIsland"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  { Updating: close an open CozyIsland window first so its files can be replaced. }
  if FileExists(ExpandConstant('{app}\CozyIsland.exe')) then
    Exec(ExpandConstant('{app}\CozyIsland.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
