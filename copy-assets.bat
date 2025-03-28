@echo off
echo 正在复制静态资源文件...

rem 创建目标目录
if not exist "dist\win\public" mkdir "dist\win\public"
if not exist "dist\linux\public" mkdir "dist\linux\public"

rem 复制静态资源文件
xcopy /E /I /Y "public" "dist\win\public"
xcopy /E /I /Y "public" "dist\linux\public"

rem 复制配置文件
copy /Y "config.json" "dist\win\"
copy /Y "config.json" "dist\linux\"

echo 静态资源文件复制完成！
