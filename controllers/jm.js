import axios from "axios";

// by yutons
// 仅仅支持json post 如: {"code":"xxx"}
export default (fastify, options, done) => {
    // 注册 POST 路由
    fastify.post('/apidecode', async (request, reply) => {
        const code = request.body.code;
        if (!code) {
            return reply.status(400).send({error: 'Missing required parameters: code'});
        }
        // 检查文本大小
        const textSize = Buffer.byteLength(code, 'utf8'); // 获取 UTF-8 编码的字节大小
        if (textSize > options.MAX_TEXT_SIZE) {
            return reply
                .status(400)
                .send({error: `Text content exceeds the maximum size of ${options.MAX_TEXT_SIZE / 1024} KB`});
        }

        // 解密
        // cbc7
        // url = "https://v.ysctv.cn/api/index/store?id=1&appid=10000";
        // base64
        // url = "http://www.xn--sss604efuw.com/tv/";
        // url = "http://ok321.top/ok";
        // url = "http://www.meowtv.top";
        // cbc
        // url = "";
        // ecb
        // url = "";
        // 以下返回html，需要优化
        // https://fmbox.cc/
        // http://kxrj.site:55/天天开心
        // https://龙伊.top
        // https://tv.xn--yhqu5zs87a.top
        // https://xn--tkh-mf3g9f.v.nxog.top/m/111.php?ou=%E5%85%AC%E4%BC%97%E5%8F%B7%E6%AC%A7%E6%AD%8Capp&mz=index&jar=index&123&b=%E6%AC%A7%E6%AD%8Ctkh?&LPY
        const data = await getJson(code, reply);
        try {
            reply.send({success: true, result: data});
        } catch (error) {
            reply.status(500).send({error: error.message});
        }
    });

    async function getJson(url, reply) {
        let key = '';
        url = url;
        if (url.includes(';')) {
            const parts = url.split(';');
            url = parts[0];
            key = parts[2] || '';
        }

        let data;
        try {
            data = await getData(url);
        } catch (error) {
            throw new Error('Error fetching data: ' + error.message);
        }

        if (!data) reply.status(500).send({error: '获取数据为空'});
        data = toString(data);
        if (isJSON(data)) return data;
        if (data.startsWith('lvDou+')) data = cbc7(data);
        if (data.indexOf('**') !== -1) data = base64(data);
        if (data.startsWith('2423')) data = cbc5(data);
        if (key) data = ecb(data, key);
        return data;
    }

    // getData
    async function getData(url) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                headers: {'User-Agent': 'okhttp'}
            });
            return response.data;
        } catch (error) {
            throw new Error('Failed to fetch data: ' + error.message);
        }
    }

    // cbc7
    function cbc7(data) {
        data = data.replace("lvDou+", "");
        data = data.replace(/"/g, "");
        let key = data.length > 16 ? data.substring(0, 16) : "";
        let iv = key;

        data = data.substring(16);

        return cbc(data, key, iv);
    }

    // cbc5
    function cbc5(data) {
        let decode = (typeof data === 'string') ? data.toLowerCase() : data.toString('utf8').toLowerCase();
        let key = padEnd(decode.substring(decode.indexOf("$#") + 2, decode.indexOf("#$")));
        let iv = padEnd(decode.substring(decode.length - 13));

        data = data.substring(data.indexOf('2324') + 4, data.length - 26);

        return cbc(data, key, iv);
    }

    // cbc
    function cbc(data, key, iv) {
        const keyBytes = CryptoJS.enc.Utf8.parse(key);
        const ivBytes = CryptoJS.enc.Utf8.parse(iv);
        const decrypted = CryptoJS.AES.decrypt(data, keyBytes, {
            iv: ivBytes,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return CryptoJS.enc.Utf8.stringify(decrypted);
    }

    // ecb
    function ecb(data, key) {
        const keyBytes = CryptoJS.enc.Utf8.parse(key);
        const decrypted = CryptoJS.AES.decrypt(data, keyBytes, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        });
        return CryptoJS.enc.Utf8.stringify(decrypted);
    }

    // base64
    function base64(data) {
        const regex = /[A-Za-z0-9]{8}\*\*/g;
        const match = data.match(regex);
        if (!match) return "";
        const matchIndex = data.indexOf(match[0]);
        data = data.substring(matchIndex + 10);
        if (data.length === 0) return data;
        return Buffer.from(data, 'base64').toString('utf8');
    }

    // padEnd
    function padEnd(key) {
        return key.padEnd(16, '0');
    }

    function toString(data) {
        return typeof data !== 'string' ? JSON.stringify(data) : data;
    }

    // jsJSON
    function isJSON(data) {
        if (data.startsWith('{')) {
            return true;
        } else {
            return false;
        }
    }

    done();
};