# Windows + WSL 本地手机测试流程

适用于已配置好数据库和账号的 WSL 2 NAT 开发环境。手机和电脑连接同一 Wi-Fi，Windows 将这个可信网络设为“专用网络”。

## 1. 启动服务

打开 Docker Desktop，在 **WSL 项目根目录**执行，保持终端运行：

```bash
docker compose up -d db
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

另开一个 **WSL 终端**，从项目根目录启动前端：

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

## 2. 设置手机访问地址

下面用 Windows IP `192.168.1.36`、WSL IP `172.28.94.85` 举例，替换为自己的当前地址。
WSL IP 可直接使用 Vite 启动输出中标注 `eth0` 的地址。

在 `frontend/.env.local` 设置 Windows 地址：

```dotenv
VITE_PUBLIC_BASE_URL=http://192.168.1.36:5173
```

修改后重启 Vite，重新获取二维码。

## 3. 配置端口转发

打开 **Windows 管理员 PowerShell**，填写当前 IP：

```powershell
$tavoloWindowsIp = "192.168.1.36"
$tavoloWslIp = "172.28.94.85"
```

之前已配置过这个地址的转发时，先删除旧规则；首次配置跳过这条：

```powershell
netsh interface portproxy delete v4tov4 listenaddress=$tavoloWindowsIp listenport=5173
```

添加转发，让手机通过 Windows 地址访问 WSL 中的前端：

```powershell
netsh interface portproxy add v4tov4 listenaddress=$tavoloWindowsIp listenport=5173 connectaddress=$tavoloWslIp connectport=5173
```

## 4. 允许手机连接

在同一个 **Windows 管理员 PowerShell** 中执行一次；之前已添加过这条防火墙规则则跳过：

```powershell
New-NetFirewallRule -DisplayName "TavoloFlow Dev 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
```

这条规则允许同一本地子网的手机访问电脑的 5173 端口。

## 5. 手机扫码

1. 电脑打开 `http://192.168.1.36:5173/staff/login`，登录服务员账号。
2. 在 `/staff/floor` 给已启用的测试桌开桌，餐厅服务也需启用。
3. 从 `/staff/tables` 获取该桌二维码，手机用 Chrome 无痕模式扫码。
4. 输入本轮入桌码，即可进入菜单。入桌码不区分大小写。

手机能进入并正常操作，即完成本地测试。
