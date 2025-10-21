/**
 * 已知问题：
 * [推荐]页面：'雷电模拟器'播放部份影片会出错，'播放器'改成'ijk' & '解码方式'改成'软解'，即可正常播放
 * 影视TV 超連結跳轉支持
 * 影视TV 弹幕支持
 * https://t.me/fongmi_offical/
 * https://github.com/FongMi/Release/tree/main/apk
 * 皮皮虾DMBox 弹幕支持
 * 设置 > 窗口预览 > 开启
 * https://t.me/pipixiawerun
 * vod_area:'bilidanmu'
 * Cookie设置
 * Cookie获取方法 https://ghproxy.net/https://raw.githubusercontent.com/UndCover/PyramidStore/main/list.md
 * Cookie设置方法1: DR-PY 后台管理界面
 * CMS后台管理 > 设置中心 > 环境变量 > {"bili_cookie":"XXXXXXX","vmid":"XXXXXX"} > 保存
 * Cookie设置方法2: 手动替换Cookie
 * 底下代码 headers的
 * "Cookie":"$bili_cookie"
 * 手动替换为
 * "Cookie":"将获取的Cookie黏贴在这"
 * 客户端长期Cookie设置教程:
 * 抓包哔哩手机端搜索access_key,取任意链接里的access_key和appkey在drpy环境变量中增加同名的环境变量即可
 * 此时哔哩.js这个解析可用于此源的解析线路用
 * 传参 ?render=1&type=url&params=../json/哔哩教育.json@哔哩教育[官]
 * 传参 ?render=1&type=url&params=../json/哔哩大全.json@哔哩大全[官]
 * 获取收藏 /x/v3/fav/resource/list?media_id=1145063440&pn=1&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web
 * &order=mtime&type=0&tid=0&platform=web
 */
var rule = {
    title: '哔哩收藏[官]',
    host: 'https://api.bilibili.com',
    homeUrl: '/x/web-interface/ranking/v2?rid=0&type=origin',
    url: '/x/v3/fav/resource/list?media_id=fyclass&pn=fypage&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web',
    // filter_url: 'keyword=fyclass{{fl.tid}}&page=fypage&duration={{fl.duration}}&order={{fl.order}}',
    class_parse: $js.toString(() => {
        // let html = request('{{host}}/files/json/哔哩教育.json');
		console.log('=============='+rule.params);
        log('rule.params:' + rule.params);
        let html = request(rule.params,{
			'Referer':''
		});
		console.log('=============='+rule.params);
        let json = dealJson(html);
        input = json.classes;
        homeObj.filter = json.filter;
        // log(input);
    }),
    filterable: 0,
    detailUrl: '/x/web-interface/view/detail?aid=fyid',
    searchUrl: '/x/web-interface/search/type?search_type=video&keyword=**&page=fypage',
    searchable: 0,
    quickSearch: 0,
    // params: '?render=1&type=url&params=../json/哔哩教育.json@哔哩教育[官]',
    // params: '?render=1&type=url&params=../json/哔哩大全.json@哔哩大全[官]',
    headers: {
        "User-Agent": "PC_UA",
        "Referer": "https://www.bilibili.com",
        "Cookie": "buvid3=666"
    },
    timeout: 5000,
    limit: 8,
    play_parse: true,
    double: false,
    lazy: `js:
        let ids = input.split('_');
        let dan = 'https://api.bilibili.com/x/v1/dm/list.so?oid=' + ids[1];
        let result = {};
        let iurl = 'https://api.bilibili.com:443/x/player/playurl?avid=' + ids[0] + '&cid=' + ids[1] + '&qn=116';
        let html = request(iurl);
        let jRoot = JSON.parse(html);
        let jo = jRoot.data;
        let ja = jo.durl;
        let maxSize = -1;
        let position = -1;
        ja.forEach(function(tmpJo, i) {
            if (maxSize < Number(tmpJo.size)) {
                maxSize = Number(tmpJo.size);
                position = i
            }
        });
        let purl = '';
        if (ja.length > 0) {
            if (position === -1) {
                position = 0
            }
            purl = ja[position].url
        }
        result.parse = 0;
        result.playUrl = '';
        result.url = unescape(purl);
        result.header = {
            'Referer': 'https://live.bilibili.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
        };
        if (/\\.flv/.test(purl)) {
            result.contentType = 'video/x-flv';
        } else {
            result.contentType = '';
        }
        result.danmaku = dan;
        input = result
    `,
    一级: `js:
        if (cateObj.tid.endsWith('_clicklink')) {
            cateObj.tid = cateObj.tid.split('_')[0];
            input = HOST + '/x/web-interface/search/type?search_type=video&keyword=' + cateObj.tid + '&page=' + MY_PAGE;
        }
        function stripHtmlTag(src) {
            return src.replace(/<\\/?[^>]+(>|$)/g, '').replace(/&.{1,5};/g, '').replace(/\\s{2,}/g, ' ');
        }
        function turnDHM(duration) {
            let min = '';
            let sec = '';
            try {
                min = duration.split(':')[0];
                sec = duration.split(':')[1];
            } catch (e) {
                min = Math.floor(duration / 60);
                sec = duration % 60;
            }
            if (isNaN(parseInt(duration))) {
                return '无效输入';
            }
            if (min == 0) {
                return sec + '秒'
            } else if (0 < min && min < 60) {
                return min + '分'
            } else if (60 <= min && min < 1440) {
                if (min % 60 == 0) {
                    let h = min / 60;
                    return h + '小时'
                } else {
                    let h = min / 60;
                    h = (h + '').split('.')[0];
                    let m = min % 60;
                    return h + '小时' + m + '分';
                }
            } else if (min >= 1440) {
                let d = min / 60 / 24;
                d = (d + '').split('.')[0];
                let h = min / 60 % 24;
                h = (h + '').split('.')[0];
                let m = min % 60;
                let dhm = '';
                if (d > 0) {
                    dhm = d + '天'
                }
                if (h >= 1) {
                    dhm = dhm + h + '小时'
                }
                if (m > 0) {
                    dhm = dhm + m + '分'
                }
                return dhm
            }
            return null
        }
        function ConvertNum(num) {
            let _ws = Math.pow(10, 1);
            let _b = 1e4;
            if (num < _b) {
                return num.toString();
            }
            let _r = '';
            let _strArg = ['', '万', '亿', '万亿'];
            let _i = Math.floor(Math.log(num) / Math.log(_b));
            if (_i > 3) {
                _i = 3;
            }
            _r = Math.floor(num / Math.pow(_b, _i) * _ws) / _ws + _strArg[_i];
            return _r;
        }
        let data = [];
        let vodList = [];
        
		data = JSON.parse(request(input)).data;
		vodList = data.medias;
		
        let videos = [];
        vodList.forEach(function(vod) {
            let aid = vod.ogv?'season-'+vod.ogv.season_id:(vod.aid ? vod.aid : vod.id);
            let title = stripHtmlTag(vod.title);
            let img = vod.cover;
            if (img.startsWith('//')) {
                img = 'https:' + img;
            }
            let play = '';
            let danmaku = '';
            
			play = ConvertNum(vod.play);
			danmaku = vod.video_review;
			
            let remark = turnDHM(vod.duration) + ' ▶' + play + ' ' + danmaku;
            videos.push({
                vod_id: aid,
                vod_name: title,
                vod_pic: img,
                vod_remarks: remark
            })
        });
        VODS = videos
    `,
    二级: `js:
        function stripHtmlTag(src) {
            return src.replace(/<\\/?[^>]+(>|$)/g, '').replace(/&.{1,5};/g, '').replace(/\\s{2,}/g, ' ');
        }
		
		function getQueryParam(urlString, param) {
		    const queryStart = urlString.indexOf('?') + 1;
		    if (!queryStart) return null;
		
		    const queryEnd = urlString.indexOf('#', queryStart);
		    const query = queryEnd === -1 ? urlString.substring(queryStart) : urlString.substring(queryStart, queryEnd);
		
		    const params = query.split('&');
		    for (let p of params) {
		        const [key, value] = p.split('=');
		        if (decodeURIComponent(key) === param) {
		            return decodeURIComponent(value || '');
		        }
		    }
		    return null;
		}
		let season_id = getQueryParam(input,'aid');
		log('=====================:' + input,season_id);
		// 判断 url_aid 是否以 season- 开头
		if (season_id && season_id.startsWith('season-')) {
			season_id = season_id.split('-')[1];
			input = 'https://api.bilibili.com/pgc/view/web/season?season_id='+season_id;

			function zh(num) {
				let p = "";
				if (Number(num) > 1e8) {
					p = (num / 1e8).toFixed(2) + "亿"
				} else if (Number(num) > 1e4) {
					p = (num / 1e4).toFixed(2) + "万"
				} else {
					p = num
				}
				return p
			}
			let html = request(input);
			let jo = JSON.parse(html).result;
			let id = jo["season_id"];
			let title = jo["title"];
			let pic = jo["cover"];
			let areas = jo["areas"][0]["name"];
			let typeName = jo["share_sub_title"];
			let date = jo["publish"]["pub_time"].substr(0, 4);
			let dec = jo["evaluate"];
			let remark = jo["new_ep"]["desc"];
			let stat = jo["stat"];
			let status = "弹幕: " + zh(stat["danmakus"]) + "　点赞: " + zh(stat["likes"]) + "　投币: " + zh(stat["coins"]) + "　追番追剧: " +
				zh(stat["favorites"]);
			let score = jo.hasOwnProperty("rating") ? "评分: " + jo["rating"]["score"] + "　" + jo["subtitle"] : "暂无评分" + "　" + jo[
				"subtitle"];
			let vod = {
				vod_id: id,
				vod_name: title,
				vod_pic: pic,
				type_name: typeName,
				vod_year: date,
				vod_area: areas,
				vod_remarks: remark,
				vod_actor: status,
				vod_director: score,
				vod_content: dec
			};
			let ja = jo["episodes"];
			// 电影默认展示，其他 过滤会员
			ja = ja.filter(function (tmpJo) {
			    return jo["show_season_type"]===2 || tmpJo["badge"] !== "会员"
			});
			let playurls1 = [];
			let playurls2 = [];
			ja.forEach(function(tmpJo) {
				let eid = tmpJo["id"];
				let cid = tmpJo["cid"];
				let link = tmpJo["link"];
				let part = tmpJo["title"].replace("#", "-") + " " + tmpJo["long_title"];
				playurls1.push(part + "$" + eid + "_" + cid);
				playurls2.push(part + "$" + link)
			});
			let playUrl = playurls1.join("#") + "$$$" + playurls2.join("#");
			vod["vod_play_from"] = "B站$$$bilibili";
			vod["vod_play_url"] = playUrl;
			VOD = vod;
		} else {
			let html = request(input);
			let jo = JSON.parse(html).data.View;
			// 历史记录
			let cookies = rule_fetch_params.headers.Cookie.split(';');
			let bili_jct = '';
			cookies.forEach(cookie => {
			    if (cookie.includes('bili_jct')) {
			        bili_jct = cookie.split('=')[1];
			    }
			});
			if (bili_jct !== '') {
			    let historyReport = 'https://api.bilibili.com/x/v2/history/report';
			    let dataPost = {
			        aid: jo.aid,
			        cid: jo.cid,
			        csrf: bili_jct,
			    };
			    post(historyReport, dataPost, 'form');
			}
			
			let stat = jo.stat;
			let up_info = JSON.parse(html).data.Card;
			let relation = up_info.following ? '已关注' : '未关注';
			let aid = jo.aid;
			let title = stripHtmlTag(jo.title);
			let pic = jo.pic;
			let desc = jo.desc;
			
			let date = new Date(jo.pubdate * 1000);
			let yy = date.getFullYear().toString();
			let mm = date.getMonth()+1;
			mm = mm < 10 ? ('0' + mm) : mm;
			let dd = date.getDate();
			dd = dd < 10 ? ('0' + dd) : dd;
			
			let up_name = jo.owner.name;
			let typeName = jo.tname;
			// let remark = jo.duration;
			let vod = {
			    vod_id: aid,
			    vod_name: title,
			    vod_pic: pic,
			    type_name: typeName,
			    vod_year: yy+mm+dd,
			    vod_area: 'bilidanmu',
			    // vod_remarks: remark,
			    vod_tags: 'mv',
			    // vod_director: ' ' + up_name + '　 ' + up_info.follower + '　' + relation,
			    vod_director: ' ' + '[a=cr:' + JSON.stringify({'id':up_name + '_clicklink','name':up_name}) + '/]' + up_name + '[/a]' + '　 ' + up_info.follower + '　' + relation,
			    vod_actor: '▶' + stat.view + '　' + '' + stat.danmaku + '　' + '' + stat.like + '　' + '' + stat.coin + '　' + '⭐' + stat.favorite,
			    vod_content: desc
			};
			let ja = jo.pages;
			let treeMap = {};
			let playurls = [];
			ja.forEach(function(tmpJo) {
			    let cid = tmpJo.cid;
			    let part = tmpJo.part.replaceAll('#', '﹟').replaceAll('$', '﹩');
			    playurls.push(
			        part + '$' + aid + '_' + cid
			    )
			});
			treeMap['B站'] = playurls.join('#');
			let relatedData = JSON.parse(html).data.Related;
			playurls = [];
			relatedData.forEach(function(rd) {
			    let ccid = rd.cid;
			    let title = rd.title.replaceAll('#', '﹟').replaceAll('$', '﹩');
			    let aaid = rd.aid;
			    playurls.push(
			        title + '$' + aaid + '_' + ccid
			    )
			});
			treeMap['相关推荐'] = playurls.join('#');
			vod.vod_play_from = Object.keys(treeMap).join("$$$");
			vod.vod_play_url = Object.values(treeMap).join("$$$");
			VOD = vod;
		}
    `,
    搜索: `js:
        let html = request(input);
        function stripHtmlTag(src) {
            return src.replace(/<\\/?[^>]+(>|$)/g, '').replace(/&.{1,5};/g, '').replace(/\\s{2,}/g, ' ');
        }
        function turnDHM(duration) {
            let min = '';
            let sec = '';
            try {
                min = duration.split(':')[0];
                sec = duration.split(':')[1];
            } catch (e) {
                min = Math.floor(duration / 60);
                sec = duration % 60;
            }
            if (isNaN(parseInt(duration))) {
                return '无效输入';
            }
            if (min == 0) {
                return sec + '秒'
            } else if (0 < min && min < 60) {
                return min + '分'
            } else if (60 <= min && min < 1440) {
                if (min % 60 == 0) {
                    let h = min / 60;
                    return h + '小时'
                } else {
                    let h = min / 60;
                    h = (h + '').split('.')[0];
                    let m = min % 60;
                    return h + '小时' + m + '分';
                }
            } else if (min >= 1440) {
                let d = min / 60 / 24;
                d = (d + '').split('.')[0];
                let h = min / 60 % 24;
                h = (h + '').split('.')[0];
                let m = min % 60;
                let dhm = '';
                if (d > 0) {
                    dhm = d + '天'
                }
                if (h >= 1) {
                    dhm = dhm + h + '小时'
                }
                if (m > 0) {
                    dhm = dhm + m + '分'
                }
                return dhm
            }
            return null
        }
        let videos = [];
        let vodList = JSON.parse(html).data.result;
        vodList.forEach(function(vod) {
            let aid = vod.aid;
            let title = stripHtmlTag(vod.title);
            let img = vod.pic;
            if (img.startsWith('//')) {
                img = 'https:' + img;
            }
            let remark = turnDHM(vod.duration);
            videos.push({
                vod_id: aid,
                vod_name: title,
                vod_pic: img,
                vod_remarks: remark
            })
        });
        VODS = videos
    `,
}
