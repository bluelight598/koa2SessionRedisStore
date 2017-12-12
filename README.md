# koa2SessionRedisStore

>   KOA2的Redis Session存储中间件
>   The session redis store middleware for KOA2

### 功能与特点
*   支持KOA2(支持async/await)
*   可自定义redis前缀
*   基于ioredis
*   同时返回可操作的redis client实例
*   配置简单
*   自动将过期时间转化为东八区时间
*   自动重新连接

### 使用方法

*   配置及初始化

```javascript
import Koa from 'koa'
import store from 'sessionRedisStore';

const app = new Koa()
app.use(store({
    key: 'sid',
    cookie: {
        signed: false, //是否要做签名
        path: '/', //cookie 的路径，默认为 /'
        domain: '.myDomain.com', //cookie 的域
        secure: false, //表示 cookie 通过 HTTP 协议发送，true 表示 cookie 通过 HTTPS 发送。
        httpOnly: true, //表示 cookie 只能通过 HTTP 协议发送
    },
    store: {
        host: '127.0.0.1', // redis地址
        port: 6379, // redis端口
        ttl: 360, // session及cookie的失效时间,单位:秒
        db: 0, // 数据库index
        keyPrefix: 'myproject:session:prefix:' // redis存储前缀
    }
}))
```

*   client用法（更多用法请查看[ioredis文档](https://www.npmjs.com/package/ioredis)）

```javascript
import store from 'sessionRedisStore';
let client = store.client

const kickOffUser = async function(userId) { // 清除指定用户的session信息，踢该用户下线
    var sessionId = await client.get(userId);
    console.log(`kickOffUser: sessionId is ${sessionId}`)
    if (sessionId) { // 存在失效用户session，则删除旧记录
        await client.del(sessionId)
    }
    return sessionId
}
```
