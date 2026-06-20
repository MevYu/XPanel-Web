import { CodeEditor } from 'xpanel-web'
import { Frame } from '../_frame'

const nginxConf = `server {
  listen 443 ssl http2;
  server_name example.com www.example.com;
  root /www/wwwroot/example.com;
  index index.php index.html;

  ssl_certificate     /etc/ssl/example.com/fullchain.pem;
  ssl_certificate_key /etc/ssl/example.com/privkey.pem;

  location ~ \\.php$ {
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    include fastcgi_params;
  }
}`

// CodeEditor lazy-loads CodeMirror (Suspense). The capture waits for the chunk to
// load, then the editor paints. cardMode/viewport set in config.
export function NginxConfig() {
  return (
    <Frame style={{ padding: 16 }}>
      <div style={{ height: 360 }}>
        <CodeEditor filename="nginx.conf" value={nginxConf} height="360px" />
      </div>
    </Frame>
  )
}
