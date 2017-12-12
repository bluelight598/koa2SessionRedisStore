'use strict';

// var debug = require('debug')('sessionRedisStore');
var	uid = require('uid2'),
	redis = require('ioredis');

/**
 * 使用`opts`初始化session中间件:
 *
 * - key: 'sid', // session cookie 名称 ["koa:sess"]
 * - cookie: {
 * - 		signed: false, //是否要做签名
 * - 		path: '/', //cookie 的路径，默认为 /'
 * - 		domain: '.xxx.com', //cookie 的域
 * - 		secure: false, //表示 cookie 通过 HTTP 协议发送，true 表示 cookie 通过 HTTPS 发送。
 * - 		httpOnly: true, //表示 cookie 只能通过 HTTP 协议发送
 * - },
 * - store: {
 * - 		host: '192.168.180.10', // redis服务host
 * - 		port: 6379, // redis服务端口
 * - 		ttl: 360, // session失效时间单位秒（同时也是cookie过期时间）
 * - 		db: 0, // 数据库
 * - 		keyPrefix: 'adms:session:' // redis存储key前缀
 * - }
 *
 * @param {Object} [opts]
 * @api public
 */

function sessionRedisStore(opts) {

	opts = opts || {};

	// key 配置
	let key = opts.key || 'koa:sess';

	//redis 配置
	let redisOption = Object.assign({
		port: 6379
		host: '127.0.0.1',
		options: {},
		db: 0
	}, opts.store);

	//cookies 配置
	let cookieOption = Object.assign({
		overwrite: true,
		httpOnly: true,
		signed: true
	}, opts.cookie);

	//redis client for session
	let client = new redis(redisOption);

	client.ttl = redisOption.ttl ? function expire(key) {
		client.expire(key, redisOption.ttl);
	} : function() {};

	/*client.select(redisOption.db, function() {
		debug('redis changed to db %d', redisOption.db);
	});

	client.on('connect', function() {
		debug('redis is connecting');
	});

	client.on('ready', function() {
		debug('redis ready');
		debug('redis host: %s', client.options.host);
		debug('redis port: %s', client.options.port);
		debug('redis parser: %s', client.replyParser.name);
	});

	client.on('reconnect', function() {
		debug('redis is reconnecting');
	});

	client.on('error', function(err) {
		debug('redis encouters error: %j', err.stack || err);
	});

	client.on('end', function() {
		debug('redis connection ended');
	});*/

	async function store(ctx, next) {
		var sess, sid, json;
		let expires = new Date(new Date(new Date().toLocaleString()).getTime() + redisOption.ttl * 1000 + 8 * 3600 * 1000)
		cookieOption.expires = expires // 设置为东八区的过期时间
		ctx.cookieOption = cookieOption;
		ctx.sessionKey = key;
		ctx.sessionId = null;
		sid = ctx.cookies.get(key, cookieOption);

		if (sid) {
			if (sid.substr(0, 4) === 's%3A') {
				sid = sid.slice(4, 36);
			}
			try {
				json = await client.get(sid);
			} catch (e) {
				// debug('encounter error %s', e);
				json = null;
			}
		}

		if (json) {
			ctx.sessionId = sid;
			try {
				sess = new Session(ctx, JSON.parse(json));
			} catch (err) {
				if (!(err instanceof SyntaxError)) throw err;
				sess = new Session(ctx);
			}
		} else {
			sid = ctx.sessionId = uid(32);
			sess = new Session(ctx);
		}

		ctx.__defineGetter__('session', function() {
			if (sess) return sess;
			if (false === sess) return null;
		});

		ctx.__defineSetter__('session', function(val) {
			if (null === val) return sess = false;
			if ('object' === typeof val) return sess = new Session(ctx, val);
			throw new Error('ctx.session can only be set as null or an object.');
		});

		try {
			await next();
		} catch (err) {
			throw err;
		} finally {
			if (undefined === sess) { // 未认证
			} else if (false === sess) { // 被移除
				await ctx.cookies.set(key, '', cookieOption);
				await client.del(sid);
			} else if (!json && !sess.length) { // do nothing if new and not populated
			} else if (sess.changed(json)) {
				json = await sess.save();
				await client.set(sid, json);
				await client.ttl(sid);
			}
		}
	};
	store.client = client;
	return store;
};

export default sessionRedisStore;

/**
 * Session module.
 *
 * @param {Context} ctx
 * @param {Object} obj
 * @api private
 */

function Session(ctx, obj) {
	this._ctx = ctx;
	if (!obj) {
		this.isNew = true;
	} else {
		for (var k in obj) this[k] = obj[k];
	}
}

/**
 * JSON representation of the session.
 *
 * @return {Object}
 * @api public
 */

Session.prototype.inspect =
	Session.prototype.toJSON = function() {
		var self = this;
		var obj = {};

		Object.keys(this).forEach(function(key) {
			if ('isNew' === key) return;
			if ('_' === key[0]) return;
			obj[key] = self[key];
		});

		return obj;
	};

/**
 * Check if the session has changed relative to the `prev`
 * JSON value from the request.
 *
 * @param {String} [prev]
 * @return {Boolean}
 * @api private
 */

Session.prototype.changed = function(prev) {
	if (!prev) return true;
	this._json = JSON.stringify(this);
	return this._json !== prev;
};

/**
 * Return how many values there are in the session object.
 * Used to see if it's "populated".
 *
 * @return {Number}
 * @api public
 */

Session.prototype.__defineGetter__('length', function() {
	return Object.keys(this.toJSON()).length;
});

/**
 * populated flag, which is just a boolean alias of .length.
 *
 * @return {Boolean}
 * @api public
 */

Session.prototype.__defineGetter__('populated', function() {
	return !!this.length;
});

/**
 * Save session changes by
 * performing a Set-Cookie.
 *
 * @api private
 */

Session.prototype.save = async function() {
	var ctx = this._ctx,
		json = this._json || JSON.stringify(this),
		sid = ctx.sessionId,
		opts = ctx.cookieOption,
		key = ctx.sessionKey;
	// debug('Session save %s', json);
	await ctx.cookies.set(key, sid, opts);
	return json;
};