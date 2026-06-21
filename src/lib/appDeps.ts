/** 安装命令:label 为发行版/包管理器,cmd 为对应安装命令。 */
export interface InstallCmd {
  label: string
  cmd: string
}

/** AppDep 描述一个模块底层依赖软件及其安装方式。 */
export interface AppDep {
  app: string
  installCmds: InstallCmd[]
  docUrl?: string
}

const apt = (pkg: string): InstallCmd => ({
  label: 'Debian/Ubuntu (apt)',
  cmd: `sudo apt update && sudo apt install -y ${pkg}`,
})

const dnf = (pkg: string): InstallCmd => ({
  label: 'CentOS/RHEL (dnf)',
  cmd: `sudo dnf install -y ${pkg}`,
})

/** APP_DEPS:moduleId → 底层依赖软件元数据。database 模块走纯网络连库,health 恒 ok,故无条目。 */
export const APP_DEPS: Record<string, AppDep> = {
  sites: {
    app: 'Nginx',
    installCmds: [apt('nginx'), dnf('nginx')],
    docUrl: 'https://nginx.org/en/docs/',
  },
  docker: {
    app: 'Docker',
    installCmds: [
      { label: '官方脚本', cmd: 'curl -fsSL https://get.docker.com | sh' },
      apt('docker.io'),
    ],
    docUrl: 'https://docs.docker.com/engine/install/',
  },
  redis: {
    app: 'Redis',
    installCmds: [apt('redis-server'), dnf('redis')],
    docUrl: 'https://redis.io/docs/latest/operate/oss_and_stack/install/',
  },
  memcached: {
    app: 'Memcached',
    installCmds: [apt('memcached'), dnf('memcached')],
    docUrl: 'https://memcached.org/',
  },
  php: {
    app: 'PHP-FPM',
    installCmds: [apt('php-fpm'), dnf('php-fpm')],
    docUrl: 'https://www.php.net/manual/en/install.fpm.php',
  },
  ftp: {
    app: 'Pure-FTPd',
    installCmds: [apt('pure-ftpd'), dnf('pure-ftpd')],
    docUrl: 'https://www.pureftpd.org/project/pure-ftpd/',
  },
  supervisor: {
    app: 'Supervisor',
    installCmds: [apt('supervisor'), dnf('supervisor')],
    docUrl: 'http://supervisord.org/installing.html',
  },
  firewall: {
    app: '防火墙 (ufw / firewalld)',
    installCmds: [apt('ufw'), dnf('firewalld')],
    docUrl: 'https://wiki.ubuntu.com/UncomplicatedFirewall',
  },
  mail: {
    app: 'Postfix + Dovecot',
    installCmds: [apt('postfix dovecot-core dovecot-imapd'), dnf('postfix dovecot')],
    docUrl: 'https://doc.dovecot.org/',
  },
  waf: {
    app: 'WAF',
    installCmds: [
      {
        label: '说明',
        cmd: '# WAF 依赖 Web 服务器与对应模块(如 nginx + ModSecurity),请先就绪 Web 服务',
      },
    ],
    docUrl: 'https://github.com/owasp-modsecurity/ModSecurity',
  },
}
