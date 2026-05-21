一、外部系统调用魔方网表 API

1 通过具体的用户名密码可以获取同身份的 TOKEN 值，TOKEN 有效期是 30 分钟。

2 调 用 方 式 是 HTTP POST 到 魔 方 网 表 访 问 地 址 /magicflu/jwt ， 内 容 是
j_username=xxx&j_password=xxx ， 分 别 是 用 户 名 和 密 码 。 Content-Type 是
application/x-www-form-urlencoded。返回的 JSON 消息如下：
{"nickname":"YYZHANG","id":"064083d2-6bc7-4b0e-abd6-
a595087a64f1","status":1,"username":"10134783","token":"eyJhbGciOiJIUzI1NiJ9.eyIkaW
50X3Blcm1zIjpbXSwic3ViIjoib3JnLnBhYzRqLmp3dC5wcm9maWxlLkp3dFByb2ZpbGUjM
TAxMzQ3ODMiLCJuaWNrTmFtZSI6IuadqOW_oOadgyIsIiRpbnRfcm9sZXMiOltdLCJleHAi
OjE2NTI0MTEzNTMsImlhdCI6MTY1MjQwOTU1M30.XTTMQuLVbZcZqs5VZLi62iRONQA
qFCLMF9pxG8e-jTI", “refreshToken”:”xxx12345678xxx”}

3 拿到 TOKEN 后，调用 API 需要设置 Authorization 头，内容为：Bearer TOKEN 值。 

4 刷新 TOKEN，TOKEN 默认有效期 30 分钟，可以使用 refreshToken 来刷新 TOKEN。
调 用 方 式 是 HTTP POST 到 魔 方 网 表 访 问 地 址 /magicflu/jwt ， 内 容 是
j_username=xxx&j_refresh=xxx ， 分 别 是 用 户 名 和 refreshToken 。 Content-Type 是
application/x-www-form-urlencoded。


二、魔方网表自身调用 API

1 获取 TOKEN 并填写到一个表单中，定时回写，每 30 分钟刷一次
表单名 TOKEN
字段名 TOKEN
修改前回写赋值 TOKEN 为：
MFJSONPATH(MFPOST("http://ip:999/magicflu/jwt", "j_username=xxx&j_password=xxx",
"UTF-8", "application/x-www-form-urlencoded"), "/token")
增加一条记录，并修改一次看到正确的 TOKEN 字符串。
定义定时回写，每 30 分钟修改一下记录。

2 Web Service 外部字段组使用 TOKEN
加 Authorization 头，内容：
"Bearer " & MFE(1, MFVLOOKUPC("TOKEN", "TOKEN")) 