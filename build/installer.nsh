; 安装程序的自定义步骤（electron-builder 会自动读这个文件：build\installer.nsh）。
;
; 卸载时删掉宠物自己登记的开机启动项。
; 为什么要我们自己删：开机启动是程序运行时自己写进注册表的（main.js 的 applyAutoStart），
; 安装程序不知道有这一项，卸载时就不会删，任务管理器的"启动应用"里会留下一个找不到文件的 Pawmail。
;
; 注册表里这一项的名字就是程序的 ID（APP_ID = app.pawmail.desktop，和 main.js 里 setAppUserModelId 的一样），
; 内容是带引号的程序路径。
;   - 升级（新版本装在旧版本上面）时也会先跑一遍卸载，这时不删：新版本第一次启动会自己重新登记。
;   - 只删指向"这次卸载的这个文件夹"的那一项：如果你同时还在用免安装版，开机启动指着免安装版，就留着不动。
;   - 任务管理器里关掉过开机启动的话，Windows 会在 StartupApproved 里另外记一笔，一起删掉。
;
; 还有待办通知用的登记（src/main/todo-notify.js 的 registerApp）：程序每次启动都把名字和图标写进
; HKCU\Software\Classes\AppUserModelId\${APP_ID}，Windows 才肯显示它的通知。卸载时（不是升级）一起删掉。

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    ${if} $0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"
    ${endIf}
    DeleteRegKey HKCU "Software\Classes\AppUserModelId\${APP_ID}"
  ${endIf}
!macroend
