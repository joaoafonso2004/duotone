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
; 4. A de produção ainda não compila: a passagem do Electron tem de ser ensaiada
;    numa máquina virtual primeiro (F10).

Var DuotonePastaDoModelo
Var DuotoneOpcao

; Com janelas: antes da 1.ª página, para a página da pasta já mostrar a certa.
; Só troca a pasta por omissão do modelo; a de uma instalação anterior (que o
; modelo lê do registo) ou a que se passa com /D= ficam como estão.
!define MUI_CUSTOMFUNCTION_GUIINIT DuotonePastaComoNoElectron
Function DuotonePastaComoNoElectron
  ${If} $INSTDIR == "$LOCALAPPDATA\$(^Name)"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\$(^Name)"
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  !if "${BUNDLEID}" == "com.joao.duotone.desktop"
    !error "A Duotone de producao ainda nao tem instalador: falta a passagem do Electron (seccao 8 do PLANO-TAURI.md), ensaiada numa maquina virtual (F10)."
  !endif
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
!macroend

!macro NSIS_HOOK_POSTINSTALL
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
