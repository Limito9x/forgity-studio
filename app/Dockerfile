# =========================================================================
# Forgity Web UI - Nginx Production Image
# Sử dụng trực tiếp bản build dist (siêu nhanh, nhẹ 20MB, 0% CPU overhead)
# =========================================================================
FROM nginx:alpine AS runtime

# Copy thư mục dist đã build sẵn
COPY dist /usr/share/nginx/html

# Cấu hình Nginx: SPA routing + Reverse Proxy /api/ và SignalR /hubs/
RUN echo 'server { \
    listen 80; \
    client_max_body_size 50M; \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://api:5189/api/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_cache_bypass $http_upgrade; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 120s; \
        proxy_read_timeout 120s; \
        proxy_buffer_size 128k; \
        proxy_buffers 4 256k; \
        proxy_busy_buffers_size 256k; \
    } \
    location /hubs/ { \
        proxy_pass http://api:5189/hubs/; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_cache_bypass $http_upgrade; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 120s; \
        proxy_read_timeout 120s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
