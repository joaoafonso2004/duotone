; Os ganchos do instalador do Duotone em Tauri (NSIS). O modelo do Tauri inclui
; este ficheiro (tauri.conf.json > bundle.windows.nsis.installerHooks) e chama as
; macros NSIS_HOOK_* nos sítios dele. Servem a Preview e a de produção; o que só a
; de produção faz decide-se pelo BUNDLEID, ao compilar (ver PLANO-TAURI.md, F9 e
; secção 8). Os textos que o NSIS mostra ficam em ASCII.
;
; 1. A pasta: %LOCALAPPDATA%\Programs\<nome>, onde o Electron instala (o ícone
;    afixado na barra aponta para lá). O modelo do Tauri usaria %LOCALAPPDATA%\<nome>.
; 2. O "--force-run" do atualizador do Electron também reabre a app.
; 3. A desinstalação tira o arranque com o Windows que a app grava (arranque.rs).
; 4. Só a de produção: a passagem do Electron (DuotoneTirarOElectron, abaixo).

Var DuotonePastaDoModelo
Var DuotoneOpcao
Var DuotoneChave
Var DuotoneDesinstalar
Var DuotoneExeAntigo
Var DuotonePastaAntiga
Var DuotoneCodigo
Var DuotoneTentativa
Var DuotoneRun
Var DuotoneAtalhoNaMesa

; Com janelas: antes da 1.ª página, para a página da pasta já mostrar a certa.
; Só troca a pasta por omissão do modelo; a de uma instalação anterior (que o
; modelo lê do registo) ou a que se passa com /D= ficam como estão.
!define MUI_CUSTOMFUNCTION_GUIINIT DuotonePastaComoNoElectron
Function DuotonePastaComoNoElectron
  ${If} $INSTDIR == "$LOCALAPPDATA\$(^Name)"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\$(^Name)"
  ${EndIf}
FunctionEnd

; A passagem da Duotone em Electron para esta (só a de produção, secção 8 do plano).
; O Electron (electron-builder, por utilizador) está em %LOCALAPPDATA%\Programs\Duotone,
; a mesma pasta desta, com duas entradas de desinstalar no HKCU (o appId de hoje e o
; antigo). Desinstala-se como o próprio electron-builder faz numa atualização dele
; (installUtil.nsh, uninstallOldVersion): o desinstalador copiado para fora, calado,
; com --keep-shortcuts (o ícone afixado, o atalho do Menu Iniciar e o da mesa ficam:
; apontam para o mesmo Duotone.exe) e --updated (tira os ficheiros de forma atómica:
; com um ocupado repõe tudo e desiste; e nunca os dados). O %APPDATA%\Duotone fica.
!macro DuotoneTirarOElectron
  ; A exportação da versão ponte, a salvo na pasta da casca nova (migracao.rs lê as duas).
  ${If} ${FileExists} "$APPDATA\Duotone\migracao\exportacao.json"
    CreateDirectory "$APPDATA\${BUNDLEID}\migracao"
    CopyFiles /SILENT "$APPDATA\Duotone\migracao\exportacao.json" "$APPDATA\${BUNDLEID}\migracao"
  ${EndIf}
  ; O arranque com o Windows (o Run com o appId, o mesmo desta casca) e o atalho da mesa:
  ; o primeiro volta se desaparecer, o segundo sai se a pessoa o tinha apagado.
  ReadRegStr $DuotoneRun HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${BUNDLEID}"
  StrCpy $DuotoneAtalhoNaMesa 0
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    StrCpy $DuotoneAtalhoNaMesa 1
  ${EndIf}

  StrCpy $DuotoneChave "Software\Microsoft\Windows\CurrentVersion\Uninstall\ef7d99c6-e9fd-5c0e-8179-ca36047fd1da"
  ReadRegStr $DuotoneDesinstalar HKCU $DuotoneChave "UninstallString"
  ${If} $DuotoneDesinstalar == ""
    StrCpy $DuotoneChave "Software\Microsoft\Windows\CurrentVersion\Uninstall\df8f0cea-a575-523e-a5fe-29cc9f25028a"
    ReadRegStr $DuotoneDesinstalar HKCU $DuotoneChave "UninstallString"
  ${EndIf}
  StrCpy $DuotoneExeAntigo ""
  ; "C:\...\Uninstall Duotone.exe" /currentuser -> o caminho entre as aspas.
  ${If} $DuotoneDesinstalar != ""
    StrCpy $DuotoneCodigo $DuotoneDesinstalar 1
    ${If} $DuotoneCodigo == '"'
      StrCpy $DuotoneExeAntigo $DuotoneDesinstalar "" 1
      ${StrLoc} $DuotoneCodigo $DuotoneExeAntigo '"' ">"
      ${If} $DuotoneCodigo != ""
        StrCpy $DuotoneExeAntigo $DuotoneExeAntigo $DuotoneCodigo
      ${Else}
        StrCpy $DuotoneExeAntigo ""
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} $DuotoneExeAntigo != ""
  ${AndIf} ${FileExists} $DuotoneExeAntigo
    ${GetParent} $DuotoneExeAntigo $DuotonePastaAntiga
    DetailPrint "Removing the previous Duotone (Electron) from $DuotonePastaAntiga"
    InitPluginsDir
    CopyFiles /SILENT $DuotoneExeAntigo "$PLUGINSDIR\duotone-electron-uninstaller.exe"
    ; Até 5 vezes, com o Electron ainda a fechar (o atualizador dele sai depois de nos correr).
    StrCpy $DuotoneTentativa 0
    ${Do}
      IntOp $DuotoneTentativa $DuotoneTentativa + 1
      ClearErrors
      ExecWait '"$PLUGINSDIR\duotone-electron-uninstaller.exe" /S /KEEP_APP_DATA /currentuser --keep-shortcuts --updated _?=$DuotonePastaAntiga' $DuotoneCodigo
      ${If} ${Errors}
        StrCpy $DuotoneCodigo 99
      ${EndIf}
      ${If} $DuotoneCodigo == 0
        ${Break}
      ${EndIf}
      ${If} $DuotoneTentativa >= 5
        ${Break}
      ${EndIf}
      Sleep 1500
    ${Loop}
    ${If} $DuotoneCodigo != 0
      ; O Electron ficou como estava (a remoção é atómica): não se instala por cima.
      DetailPrint "The previous Duotone could not be removed (code $DuotoneCodigo)"
      MessageBox MB_ICONEXCLAMATION|MB_OK "Close Duotone and run this installer again." /SD IDOK
      Abort
    ${EndIf}
    ; Corrido no sítio (_?=), o desinstalador não se apaga a si próprio.
    Delete $DuotoneExeAntigo
    RMDir $DuotonePastaAntiga
  ${EndIf}

  ; As entradas do Electron (com --updated ficam): uma só "Duotone" nas Aplicações, a desta.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ef7d99c6-e9fd-5c0e-8179-ca36047fd1da"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\df8f0cea-a575-523e-a5fe-29cc9f25028a"
  DeleteRegKey HKCU "Software\ef7d99c6-e9fd-5c0e-8179-ca36047fd1da"
  DeleteRegKey HKCU "Software\df8f0cea-a575-523e-a5fe-29cc9f25028a"
  ${If} $DuotoneRun != ""
    ReadRegStr $DuotoneCodigo HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${BUNDLEID}"
    ${If} $DuotoneCodigo == ""
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${BUNDLEID}" $DuotoneRun
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Calado (o atualizador, ou /S à mão) não há páginas: a mesma troca, aqui. O
  ; modelo já criou a pasta por omissão (o SetOutPath): sai-se dela e apaga-se se
  ; estiver vazia (o RMDir sem /r nunca apaga nada lá dentro).
  ${If} ${Silent}
  ${AndIf} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
    StrCpy $DuotonePastaDoModelo $INSTDIR
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
    SetOutPath $INSTDIR
    RMDir "$DuotonePastaDoModelo"
  ${EndIf}
  StrCpy $DuotoneAtalhoNaMesa 1
  !if "${BUNDLEID}" == "com.joao.duotone.desktop"
    !insertmacro DuotoneTirarOElectron
  !endif
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Quem tinha apagado o atalho da mesa do Electron não o vê voltar (o modelo, calado,
  ; cria-o sempre que não é uma atualização Tauri, e o do Electron chega com "--updated").
  ${If} $DuotoneAtalhoNaMesa == 0
    Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  ${EndIf}
  ; O atualizador do Electron corre "/S --updated --force-run". O "/R" do Tauri já
  ; reabre a app (no .onInstSuccess do modelo); sem ele, o "--force-run" reabre-a
  ; aqui, também como o utilizador (nunca elevada).
  ${If} ${Silent}
    ClearErrors
    ${GetOptions} $CMDLINE "/R" $DuotoneOpcao
    ${If} ${Errors}
      ClearErrors
      ${GetOptions} $CMDLINE "--force-run" $DuotoneOpcao
      ${IfNot} ${Errors}
        nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; O arranque com o Windows grava o Run com o identificador (o modelo só apaga o
  ; do nome). Numa atualização (/UPDATE) fica, como no modelo.
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${BUNDLEID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${BUNDLEID}"
  ${EndIf}
!macroend
