/**
 * 全能代理控制器模块
 * 智能判断URL类型并路由到对应的代理服务
 * 支持文件代理和M3U8流媒体代理的自动切换
 * @module unified-proxy-controller
 */

import http from 'http';
import https from 'https';
import {
    decodeParam,
    getDefaultHeaders,
    getRemoteContent,
    makeRemoteRequest,
    PROXY_CONSTANTS,
    setCorsHeaders,
    verifyAuth,
    CacheManagerFactory,
    createHealthResponse,
    createStatusResponse
} from '../utils/proxy-util.js';

/**
 * 全能代理控制器插件
 * @param {Object} fastify - Fastify实例
 * @param {Object} options - 插件选项
 * @param {Function} done - 完成回调
 */
export default (fastify, options, done) => {
    // 请求缓存 - 使用智能缓存管理器防止内存泄漏
    const requestCache = CacheManagerFactory.createRequestCache('UnifiedProxy-RequestCache');

    /**
     * 发起远程HEAD请求检测内容类型
     * @param {string} url - 远程文件 URL
     * @param {Object} headers - 请求头
     * @returns {Promise} 请求结果
     */
    function makeHeadRequest(url, headers) {
        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const isHttps = urlObj.protocol === 'https:';
                const httpModule = isHttps ? https : http;

                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'HEAD',
                    headers: headers,
                    timeout: 5000 // 5秒超时，用于快速检测
                };

                const req = httpModule.request(options, (res) => {
                    // 检查响应状态码
                    if (res.statusCode >= 400) {
                        reject(new Error(`HEAD request failed with status: ${res.statusCode}`));
                        return;
                    }
                    
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers
                    });
                });

                req.on('error', (error) => {
                    reject(new Error(`HEAD request failed: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('HEAD request timeout'));
                });

                req.setTimeout(5000, () => {
                    req.destroy();
                    reject(new Error('HEAD request timeout'));
                });

                req.end();
            } catch (error) {
                reject(new Error(`Invalid URL or request setup: ${error.message}`));
            }
        });
    }

    /**
     * 智能判断URL类型
     * @param {string} url - 目标URL
     * @param {Object} headers - 请求头
     * @returns {Promise<string>} 代理类型：'m3u8' 或 'file'
     */
    async function detectProxyType(url, headers) {
        try {
            // 1. 基于URL扩展名的快速判断
            const urlLower = url.toLowerCase();
            
            // M3U8相关扩展名
            if (urlLower.includes('.m3u8') || urlLower.includes('.ts')) {
                // console.log(`[unifiedProxyController] Detected M3U8 by extension: ${url}`);
                return 'm3u8';
            }

            // 2. 基于URL路径关键词判断
            const m3u8Keywords = [
                'playlist', 'live', 'stream', 'hls', 'manifest',
                'm3u8', 'ts', 'segment', 'chunk'
            ];
            
            if (m3u8Keywords.some(keyword => urlLower.includes(keyword))) {
                // console.log(`[unifiedProxyController] Detected M3U8 by keyword: ${url}`);
                return 'm3u8';
            }

            // 3. 通过HEAD请求检测Content-Type（带超时和错误处理）
            try {
                const headResponse = await Promise.race([
                    makeHeadRequest(url, headers),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('HEAD request timeout')), 5000)
                    )
                ]);
                
                const contentType = headResponse.headers['content-type'] || '';
                
                // console.log(`[unifiedProxyController] HEAD response Content-Type: ${contentType} for URL: ${url}`);
                
                // M3U8相关的Content-Type
                const m3u8ContentTypes = [
                    'application/vnd.apple.mpegurl',
                    'application/x-mpegurl',
                    'video/mp2t',
                    'application/octet-stream'
                ];
                
                if (m3u8ContentTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()))) {
                    // console.log(`[unifiedProxyController] Detected M3U8 by Content-Type: ${contentType}`);
                    return 'm3u8';
                }
                
                // 如果Content-Type明确指示为其他类型，使用文件代理
                if (contentType.includes('image/') || 
                    contentType.includes('video/mp4') || 
                    contentType.includes('audio/') ||
                    contentType.includes('application/pdf')) {
                    // console.log(`[unifiedProxyController] Detected file by Content-Type: ${contentType}`);
                    return 'file';
                }
                
            } catch (headError) {
                console.warn(`[unifiedProxyController] HEAD request failed, using fallback detection: ${headError.message}`);
            }

            // 4. 默认回退到文件代理
            // console.log(`[unifiedProxyController] Using default file proxy for: ${url}`);
            return 'file';
            
        } catch (error) {
            console.error(`[unifiedProxyController] Detection error, falling back to file proxy: ${error.message}`);
            return 'file';
        }
    }





    /**
     * 解析 M3U8 文件内容，转换相对链接为代理链接
     * @param {string} content - M3U8 文件内容
     * @param {string} baseUrl - 基础 URL
     * @param {string} proxyBaseUrl - 代理基础 URL
     * @param {string} authCode - 身份验证码
     * @param {string} headersParam - headers参数
     * @returns {string} 处理后的 M3U8 内容
     */
    function processM3u8ContentUnified(content, baseUrl, proxyBaseUrl, authCode, headersParam) {
        // console.log(`[unifiedProxyController] Processing M3U8 content, headersParam present: ${!!headersParam}`);
        if (headersParam) {
            // console.log(`[unifiedProxyController] headersParam value: ${headersParam}`);
        }

        const lines = content.split('\n');
        const processedLines = [];

        for (let line of lines) {
            line = line.trim();
            
            // 跳过空行和注释行（以 # 开头）
            if (!line || line.startsWith('#')) {
                processedLines.push(line);
                continue;
            }

            // 处理 TS 文件链接和嵌套 M3U8 链接
            let processedLine = line;
            
            try {
                // 判断是否为相对链接
                if (!line.startsWith('http://') && !line.startsWith('https://')) {
                    // 相对链接，需要转换为绝对链接
                    const absoluteUrl = new URL(line, baseUrl).href;
                    // 转换为统一代理链接，传递headers参数
                    const encodedUrl = encodeURIComponent(absoluteUrl);
                    processedLine = `${proxyBaseUrl}/unified-proxy/proxy?url=${encodedUrl}&auth=${authCode}`;
                    if (headersParam) {
                        const encodedHeaders = encodeURIComponent(headersParam);
                        processedLine += `&headers=${encodedHeaders}`;
                    }
                } else {
                    // 绝对链接，直接转换为统一代理链接
                    const encodedUrl = encodeURIComponent(line);
                    processedLine = `${proxyBaseUrl}/unified-proxy/proxy?url=${encodedUrl}&auth=${authCode}`;
                    if (headersParam) {
                        const encodedHeaders = encodeURIComponent(headersParam);
                        processedLine += `&headers=${encodedHeaders}`;
                    }
                }
            } catch (error) {
                console.warn(`Failed to process M3U8 line: ${line}`, error);
                // 处理失败时保持原链接
                processedLine = line;
            }

            processedLines.push(processedLine);
        }

        return processedLines.join('\n');
    }

    /**
     * 获取请求的基础 URL（协议 + 主机 + 端口）
     * @param {Object} request - Fastify 请求对象
     * @returns {string} 基础 URL
     */
    function getProxyBaseUrl(request) {
        const protocol = request.headers['x-forwarded-proto'] || 
                        (request.socket.encrypted ? 'https' : 'http');
        const host = request.headers['x-forwarded-host'] || 
                    request.headers.host || 
                    'localhost:3001';
        return `${protocol}://${host}`;
    }

    /**
     * 处理文件代理请求
     * @param {Object} request - Fastify请求对象
     * @param {Object} reply - Fastify响应对象
     * @param {string} targetUrl - 目标URL
     * @param {Object} requestHeaders - 请求头
     */
    async function handleFileProxy(request, reply, targetUrl, requestHeaders) {
        // console.log(`[unifiedProxyController] Handling as file proxy: ${targetUrl}`);
        
        try {
            // 处理 Range 请求
            const range = request.headers.range;

            // 发起远程请求
            const remoteResponse = await makeRemoteRequest(
                targetUrl, 
                requestHeaders, 
                request.method, 
                range
            );

            // 检查远程响应状态
            if (remoteResponse.statusCode >= 400) {
                return reply.status(remoteResponse.statusCode).send({
                    error: `Remote server error: ${remoteResponse.statusCode}`
                });
            }

            // 设置响应状态码
            reply.status(remoteResponse.statusCode);

            // 转发重要的响应头
            const headersToForward = [
                'content-type',
                'content-length',
                'content-range',
                'accept-ranges',
                'last-modified',
                'etag',
                'cache-control',
                'expires'
            ];

            headersToForward.forEach(header => {
                if (remoteResponse.headers[header]) {
                    reply.header(header, remoteResponse.headers[header]);
                }
            });

            // 设置 CORS 头
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            reply.header('Access-Control-Allow-Headers', 'Range, Content-Type');

            // 对于 HEAD 请求，只返回头部信息
            if (request.method === 'HEAD') {
                return reply.send();
            }

            // 对于 GET 请求，返回文件流
            return reply.send(remoteResponse.stream);

        } catch (requestError) {
            console.error('[unifiedProxyController] File proxy error:', requestError);
            return reply.status(502).send({ 
                error: `Failed to fetch file: ${requestError.message}` 
            });
        }
    }

    /**
     * 处理M3U8代理请求
     * @param {Object} request - Fastify请求对象
     * @param {Object} reply - Fastify响应对象
     * @param {string} targetUrl - 目标URL
     * @param {Object} requestHeaders - 请求头
     * @param {string} headersParam - headers参数
     */
    async function handleM3u8Proxy(request, reply, targetUrl, requestHeaders, headersParam) {
        // console.log(`[unifiedProxyController] Handling as M3U8 proxy: ${targetUrl}`);
        
        try {
            // 判断是M3U8索引文件还是TS片段
            const isM3u8File = targetUrl.toLowerCase().includes('.m3u8');
            
            if (isM3u8File) {
                // 处理M3U8索引文件
                // console.log(`[unifiedProxyController] Processing M3U8 playlist: ${targetUrl}`);
                
                // 获取 M3U8 文件内容
                const m3u8Content = await getRemoteContent(targetUrl, requestHeaders);

                // 获取代理基础 URL
                const proxyBaseUrl = getProxyBaseUrl(request);
                
                // 处理 M3U8 内容，转换链接
                const processedContent = processM3u8ContentUnified(
                    m3u8Content, 
                    targetUrl, 
                    proxyBaseUrl, 
                    request.query.auth,
                    headersParam
                );

                // 设置响应头
                reply.header('Content-Type', 'application/vnd.apple.mpegurl');
                setCorsHeaders(reply);
                reply.header('Cache-Control', 'no-cache');

                return reply.send(processedContent);
                
            } else {
                // 处理TS片段文件，使用文件代理逻辑
                // console.log(`[unifiedProxyController] Processing TS segment: ${targetUrl}`);
                return await handleFileProxy(request, reply, targetUrl, requestHeaders);
            }

        } catch (requestError) {
            console.error('[unifiedProxyController] M3U8 proxy error:', requestError);
            return reply.status(502).send({ 
                error: `Failed to fetch M3U8 content: ${requestError.message}` 
            });
        }
    }

    /**
     * 全能代理健康检查接口
     * GET /unified-proxy/health - 检查全能代理服务状态
     */
    fastify.get('/unified-proxy/health', async (request, reply) => {
        // console.log(`[unifiedProxyController] Health check request`);

        setCorsHeaders(reply);
        
        const healthData = createHealthResponse(requestCache);
        
        return reply.send({
            ...healthData,
            service: 'Unified Smart Proxy',
            features: [
                'Smart URL type detection',
                'Automatic routing to file-proxy or m3u8-proxy',
                'Content-Type based detection',
                'URL pattern analysis',
                'Fallback mechanism',
                'Smart cache management with auto-cleanup'
            ]
        });
    });

    /**
     * 全能代理主接口
     * GET/HEAD /unified-proxy/proxy - 智能代理任意URL
     */
    fastify.route({
        method: ['GET', 'HEAD'],
        url: '/unified-proxy/proxy',
        handler: async (request, reply) => {
            // 验证身份认证
            if (!verifyAuth(request, reply)) {
                return;
            }

            const { url: urlParam, headers: headersParam, type: forceType } = request.query;

            // console.log(`[unifiedProxyController] ${request.method} request for URL: ${urlParam}`);

            // 验证必需参数
            if (!urlParam) {
                return reply.status(400).send({ error: 'Missing required parameter: url' });
            }

            try {
                // 解码 URL 参数
                const targetUrl = decodeParam(urlParam, false);
                
                // 验证 URL 格式和安全性
                if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                    return reply.status(400).send({ error: 'Invalid URL: must start with http:// or https://' });
                }

                // 验证 URL 是否为有效格式
                let urlObj;
                try {
                    urlObj = new URL(targetUrl);
                } catch (urlError) {
                    return reply.status(400).send({ error: `Invalid URL format: ${urlError.message}` });
                }

                // 安全检查：防止访问内网地址
                const hostname = urlObj.hostname.toLowerCase();
                if (hostname === 'localhost' || 
                    hostname === '127.0.0.1' || 
                    hostname.startsWith('192.168.') ||
                    hostname.startsWith('10.') ||
                    hostname.startsWith('172.')) {
                    console.warn(`[unifiedProxyController] Blocked internal network access: ${hostname}`);
                    return reply.status(403).send({ error: 'Access to internal network addresses is not allowed' });
                }

                // 解码 headers 参数
                let customHeaders = {};
                try {
                    customHeaders = decodeParam(headersParam, true);
                } catch (headerError) {
                    console.warn(`[unifiedProxyController] Invalid headers parameter: ${headerError.message}`);
                    // 继续执行，使用空的自定义头
                }
                
                // 合并默认请求头和自定义请求头
                const defaultHeaders = getDefaultHeaders(request);
                const requestHeaders = { ...defaultHeaders, ...customHeaders };

                // 验证请求头大小
                const headersString = JSON.stringify(requestHeaders);
                if (headersString.length > 8192) { // 8KB 限制
                    return reply.status(400).send({ error: 'Request headers too large' });
                }

                // 智能检测代理类型（除非强制指定类型）
                let proxyType = forceType;
                if (!proxyType || (proxyType !== 'file' && proxyType !== 'm3u8')) {
                    proxyType = await detectProxyType(targetUrl, requestHeaders);
                }

                // console.log(`[unifiedProxyController] Using proxy type: ${proxyType} for URL: ${targetUrl}`);

                // 根据检测结果选择代理方式，并实现智能回退
                if (proxyType === 'm3u8') {
                    try {
                        return await handleM3u8Proxy(request, reply, targetUrl, requestHeaders, headersParam);
                    } catch (m3u8Error) {
                        console.warn(`[unifiedProxyController] M3U8 proxy failed, falling back to file proxy: ${m3u8Error.message}`);
                        // M3U8代理失败时，回退到文件代理
                        try {
                            return await handleFileProxy(request, reply, targetUrl, requestHeaders);
                        } catch (fileError) {
                            console.error(`[unifiedProxyController] Both M3U8 and file proxy failed: ${fileError.message}`);
                            return reply.status(502).send({ 
                                error: `Proxy failed: M3U8 (${m3u8Error.message}), File (${fileError.message})` 
                            });
                        }
                    }
                } else {
                    try {
                        return await handleFileProxy(request, reply, targetUrl, requestHeaders);
                    } catch (fileError) {
                        console.warn(`[unifiedProxyController] File proxy failed, trying M3U8 proxy: ${fileError.message}`);
                        // 文件代理失败时，尝试M3U8代理（可能是误判）
                        try {
                            return await handleM3u8Proxy(request, reply, targetUrl, requestHeaders, headersParam);
                        } catch (m3u8Error) {
                            console.error(`[unifiedProxyController] Both file and M3U8 proxy failed: ${m3u8Error.message}`);
                            return reply.status(502).send({ 
                                error: `Proxy failed: File (${fileError.message}), M3U8 (${m3u8Error.message})` 
                            });
                        }
                    }
                }

            } catch (error) {
                console.error('[unifiedProxyController] Request processing error:', error);
                return reply.status(500).send({ error: error.message });
            }
        }
    });

    /**
     * 全能代理状态接口
     * GET /unified-proxy/status - 获取代理服务状态
     */
    fastify.get('/unified-proxy/status', async (request, reply) => {
        // console.log(`[unifiedProxyController] Status request`);

        try {
            setCorsHeaders(reply);
            
            const features = [
                'Smart URL type detection',
                'Automatic proxy routing',
                'Base64 parameter decoding',
                'Custom headers support',
                'Force type override',
                'CORS support',
                'Authentication protection',
                'Intelligent fallback',
                'Smart cache management with auto-cleanup'
            ];
            
            const endpoints = [
                'GET /unified-proxy/health - Health check (no auth required)',
                'GET /unified-proxy/proxy?url=<target_url>&auth=<auth_code>&headers=<custom_headers>&type=<force_type> - Smart proxy',
                'HEAD /unified-proxy/proxy?url=<target_url>&auth=<auth_code>&headers=<custom_headers>&type=<force_type> - Smart proxy headers',
                'GET /unified-proxy/status - Get service status (no auth required)'
            ];
            
            const additionalInfo = {
                detection: {
                    methods: [
                        'URL extension analysis (.m3u8, .ts)',
                        'URL path keyword matching',
                        'HTTP HEAD Content-Type detection',
                        'Fallback to file proxy'
                    ],
                    supportedTypes: ['m3u8', 'file']
                },
                routing: {
                    'm3u8-proxy': 'M3U8 playlists and TS segments',
                    'file-proxy': 'General files, images, videos, documents'
                }
            };
            
            const statusData = createStatusResponse(
                'Unified Smart Proxy Controller',
                '1.0.0',
                features,
                endpoints,
                requestCache,
                null,
                additionalInfo
            );
            
            return reply.send(statusData);
        } catch (error) {
            console.error('[unifiedProxyController] Status request error:', error);
            return reply.status(500).send({ error: error.message });
        }
    });

    done();
};