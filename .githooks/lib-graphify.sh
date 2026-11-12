# Funciones comunes de los hooks de git de graphify. Se carga con `.`, no se ejecuta.
# POSIX sh, también el /bin/sh de macOS (bash 3.2): sin arrays, sin [[ ]], sin timeout.
# Ningún camino puede hacer fallar un commit ni un checkout: los hooks terminan en 0.
#
# El binario es el de la instalación aislada de Club Colina (fuera del repo, una carpeta por
# versión), nunca el del PATH: la versión fijada en .graphify-version solo es real si no
# depende de lo que cada máquina tenga instalado. Lo crea scripts/setup-dev.sh.

# Quita del entorno todo lo que hace que graphify 0.9.76 elija un modelo por su cuenta, para
# que ningún camino (una opción que se coló, un archivo que no es código) mande nada del
# repo a un modelo ni a terceros. Sale de detect_backend() en llm.py (3189-3219): las claves
# de cada backend de BACKENDS (llm.py:111, 122, 133, 144, 159, 176, 198) y las variables de
# _BACKEND_DETECTION_EXTRA_ENV (llm.py:3167-3171). GRAPHIFY_ALLOW_LOCAL_PROVIDERS
# (llm.py:278) sumaría proveedores de un .graphify/providers.json del repo. Al subir de
# versión, se vuelve a leer detect_backend() y se rehace esta lista. Es la segunda capa:
# la primera es la lista blanca de graphify_exec.
graphify_no_backend() {
  unset ANTHROPIC_API_KEY MOONSHOT_API_KEY OLLAMA_API_KEY GEMINI_API_KEY GOOGLE_API_KEY \
    OPENAI_API_KEY DEEPSEEK_API_KEY AZURE_OPENAI_API_KEY AZURE_OPENAI_ENDPOINT \
    AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION OLLAMA_BASE_URL OLLAMA_HOST \
    GRAPHIFY_ALLOW_LOCAL_PROVIDERS
}

# Reemplaza al proceso actual por <asignaciones VAR=valor...> <comando> <argumentos...>, con
# `env -i` y la lista blanca común: PATH fijo y mínimo (ni `claude` ni nada instalado por el
# usuario se resuelve) y HOME, USER, LOGNAME, LANG, LC_ALL, TERM y TMPDIR solo si están
# definidas. Hace `exec`: se llama dentro de un subshell, `( graphify_env_exec … )`, y así el PID
# del subshell es el del programa (quien lo lanza en segundo plano puede matarlo con $!).
graphify_env_exec() {
  [ -z "${TMPDIR+x}" ] || set -- "TMPDIR=$TMPDIR" "$@"
  [ -z "${TERM+x}" ] || set -- "TERM=$TERM" "$@"
  [ -z "${LC_ALL+x}" ] || set -- "LC_ALL=$LC_ALL" "$@"
  [ -z "${LANG+x}" ] || set -- "LANG=$LANG" "$@"
  [ -z "${LOGNAME+x}" ] || set -- "LOGNAME=$LOGNAME" "$@"
  [ -z "${USER+x}" ] || set -- "USER=$USER" "$@"
  [ -z "${HOME+x}" ] || set -- "HOME=$HOME" "$@"
  exec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin "$@"
}

# Única forma de ejecutar el binario de graphify: `graphify_exec <binario> <argumentos...>`.
# Lo corre con `env -i` y una lista blanca de variables (graphify_env_exec), no con una lista
# negra: lo que no se nombra (ANTHROPIC_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, AWS_*,
# OPENROUTER_API_KEY, GRAPHIFY_BACKEND, GRAPHIFY_API_KEY, GRAPHIFY_OUT, lo que se añada mañana)
# no le llega. Además de la lista común:
# - Las GRAPHIFY_* fijas del estándar. Sin GRAPHIFY_NO_AUTO_REFRESH, cualquier comando de la
#   0.9.76 reescribe los skills globales de graphify (~/.claude, ~/.agents). GRAPHIFY_OUT no
#   pasa (cambia la carpeta del grafo, paths.py:26 de la 0.9.76): siempre graphify-out/ del repo.
# - PYTHONHASHSEED=0 para que `extract` y `update` den el mismo grafo (salvo lo que tolera G3 en
#   references/decisiones.md de la skill graphify-estandar: nodos de docstring).
# El binario no va directo a `env`: `env` toma por asignación todo argumento con «=» antes del
# comando, así que una ruta como /a=b/graphify se tomaría por variable. Va como $0 de
# `/bin/sh -c 'exec "$0" "$@"'`, que `env` nunca interpreta.
# graphify_exec corre en un subshell; graphify_exec_exec reemplaza al proceso actual (para
# `( graphify_exec_exec … ) &`, donde $! queda siendo el PID del binario).
graphify_exec() {
  ( graphify_exec_exec "$@" )
}

graphify_exec_exec() {
  graphify_no_backend
  _xb=$1
  shift
  graphify_env_exec GRAPHIFY_NO_AUTO_REFRESH=1 GRAPHIFY_QUERY_LOG_DISABLE=1 GRAPHIFY_NO_TIPS=1 \
    GRAPHIFY_NO_BACKUP=1 PYTHONHASHSEED=0 /bin/sh -c 'exec "$0" "$@"' "$_xb" "$@"
}

# Filtro de la salida del envoltorio: graphify aconseja a veces seguir con comandos que en este
# repo no existen o mandarían contenido a un modelo (/graphify, `graphify cluster-only`,
# `graphify label`, --update). Lee stdin. Uso: graphify_filter [<rc de graphify>].
# - rc 0 (o sin argumento): esas líneas se reemplazan por una sola frase.
# - rc distinto de 0: la línea original se conserva y la frase se agrega al lado. Con un error,
#   la línea puede ser el diagnóstico (p. ej. «error: path not found: /graphify») y no la
#   sugerencia; reemplazarla escondería el error.
# LC_ALL=C: sed trata la entrada como bytes. Con un locale UTF-8, el sed de macOS corta la salida
# en el primer byte que no es UTF-8 («illegal byte sequence»).
graphify_filter() {
  _fm='[graphify] en este repo solo se usa scripts/graphify (solo AST)'
  [ "${1:-0}" = 0 ] || _fm="&  $_fm"
  LC_ALL=C sed -E "s#^(.*[^/A-Za-z0-9_-])?(/graphify|graphify (cluster-only|label))([^A-Za-z0-9_-].*)?\$#$_fm#;
          s#^(.*[[:space:]])?--update([[:space:]=].*)?\$#$_fm#"
}

# graphify_exec con stdout y stderr pasados por graphify_filter, conservando el código de salida.
# Es lo que usan scripts/graphify, scripts/setup-dev.sh, el SessionStart de la nube y el rebuild de
# los hooks de git (graphify_rebuild).
# Uso: graphify_exec_filtered <binario> <argumentos...>
# - stdout y stderr van a dos temporales y se filtran al terminar, cuando ya se sabe el rc
#   (graphify_filter depende de él). La salida no se ve en streaming: llega entera al final.
# - graphify corre en segundo plano y aquí se espera con `wait`: así un TERM, INT o HUP llega
#   al trap mientras graphify corre (con el binario en primer plano, sh posterga el trap hasta
#   que termine). El trap mata al binario, borra los temporales y sale con 128 + la señal.
#   El trap reemplaza los de INT, TERM y HUP de quien llama, y al volver quedan por defecto.
# - `&& … || …` para el rc: con `set -e` (setup-dev) un `wait` que devuelve distinto de 0
#   abortaría antes de filtrar y de borrar los temporales.
graphify_exec_filtered() {
  _ef=$(mktemp "${TMPDIR:-/tmp}/graphify-err.XXXXXX") || return 1
  _of=$(mktemp "${TMPDIR:-/tmp}/graphify-out.XXXXXX") || { rm -f "$_ef"; return 1; }
  ( graphify_exec_exec "$@" ) > "$_of" 2> "$_ef" &
  _efp=$!
  trap '_graphify_ef_signal 130' INT
  trap '_graphify_ef_signal 143' TERM
  trap '_graphify_ef_signal 129' HUP
  wait "$_efp" && _rc=0 || _rc=$?
  trap - INT TERM HUP
  graphify_filter "$_rc" < "$_of"
  graphify_filter "$_rc" < "$_ef" >&2
  rm -f "$_ef" "$_of"
  return "$_rc"
}

_graphify_ef_signal() {
  trap - INT TERM HUP
  kill -TERM "$_efp" 2>/dev/null
  wait "$_efp" 2>/dev/null
  rm -f "$_ef" "$_of"
  exit "$1"
}

graphify_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

# Éxito si $1 es exactamente X.Y.Z (dígitos), en una sola línea.
graphify_version_valid() {
  printf '%s' "$1" | awk 'NR == 1 && /^[0-9]+\.[0-9]+\.[0-9]+$/ { ok = 1 } END { exit !(ok && NR == 1) }'
}

# Versión fijada en .graphify-version. Falla si el archivo no existe o si no es exactamente
# X.Y.Z en una sola línea: la versión termina en una ruta que `uv venv --clear` borra, así
# que una versión vacía o con basura nunca debe llegar a construir una ruta. Es la única
# función que lee ese archivo. Recibe la raíz del repo (por defecto, la de git).
graphify_version() {
  _vroot=${1:-$(graphify_root)} || return 1
  [ -n "$_vroot" ] && [ -f "$_vroot/.graphify-version" ] || return 1
  _v=$(tr -d '\r' < "$_vroot/.graphify-version")
  graphify_version_valid "$_v" || return 1
  printf '%s\n' "$_v"
}

# Carpeta base de datos: XDG_DATA_HOME, o ~/.local/share si no está definida (o está vacía).
# Falla, sin imprimir nada, si XDG_DATA_HOME es relativa o si hace falta HOME y está vacío o es
# relativo: la instalación terminaría en una ruta relativa al directorio de trabajo.
graphify_data_home() {
  if [ -n "${XDG_DATA_HOME:-}" ]; then
    case "$XDG_DATA_HOME" in /*) printf '%s\n' "$XDG_DATA_HOME" ;; *) return 1 ;; esac
  else
    case "${HOME:-}" in /*) printf '%s/.local/share\n' "$HOME" ;; *) return 1 ;; esac
  fi
}

# Éxito si las pruebas pidieron otro binario: GRAPHIFY_BIN solo se respeta junto con
# GRAPHIFY_ALLOW_TEST_BIN=1. Una GRAPHIFY_BIN suelta (heredada, o puesta por error) se ignora.
# Las dos están en `deny` de .claude/settings.json: solo las fijan las baterías, dentro del script.
graphify_test_bin() {
  [ -n "${GRAPHIFY_BIN:-}" ] && [ "${GRAPHIFY_ALLOW_TEST_BIN:-}" = "1" ]
}

graphify_bin() {
  if graphify_test_bin; then
    printf '%s\n' "$GRAPHIFY_BIN"
    return 0
  fi
  _ver=$(graphify_version "${1:-}") || return 1
  _bdata=$(graphify_data_home) || return 1
  printf '%s\n' "$_bdata/club-colina-graphify/$_ver/bin/graphify"
}

# Éxito si <binario> existe y su --version es exactamente la de <versión>.
graphify_version_ok() {
  [ -x "$1" ] && [ "$(graphify_exec "$1" --version 2>/dev/null)" = "graphify $2" ]
}

# 8 primeros hex del sha256 de stdin.
graphify_sha8() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -c1-8
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -c1-8
  else
    openssl dgst -sha256 | awk '{ print substr($NF, 1, 8) }'
  fi
}

# Ruta del log de este repo: un log por repo, para que dos worktrees o dos clones no se pisen
# ni mezclen sus «inicio/fin»: ${XDG_CACHE_HOME:-~/.cache}/club-colina-graphify/<nombre>-<8 hex
# del sha256 de la ruta raíz>.log. Es la única función que construye esa ruta; todos los
# mensajes que la citan la llaman. Recibe la raíz del repo (por defecto, la de git).
graphify_log() {
  _lroot=${1:-$(graphify_root)}
  [ -n "$_lroot" ] || return 1
  printf '%s/club-colina-graphify/%s-%s.log\n' "${XDG_CACHE_HOME:-$HOME/.cache}" \
    "$(basename "$_lroot")" "$(printf '%s' "$_lroot" | graphify_sha8)"
}

# Crea el directorio del log (700) y el log (600), con umask 077 en el subshell que los crea.
graphify_log_init() {
  (
    umask 077
    mkdir -p "$(dirname "$1")" && chmod 700 "$(dirname "$1")" && : >> "$1" && chmod 600 "$1"
  ) 2>/dev/null
}

# El log solo crece: si pasa de 4000 líneas se deja en las últimas 2000. Se reescribe en el
# mismo archivo (no mv): un rebuild en segundo plano que siga escribiendo lo hace sobre este.
# Pérdida acotada aceptada: lo que otro proceso añada entre el `tail` y el `cat` se pierde (a
# lo sumo las pocas líneas de un rebuild que justo empiece o termine en ese instante). El
# archivo temporal lleva el PID ($$) para que dos recortes simultáneos no se pisen.
graphify_log_trim() {
  [ -f "$1" ] || return 0
  _n=$(wc -l < "$1" | tr -d ' ')
  [ "${_n:-0}" -gt 4000 ] || return 0
  ( umask 077; tail -n 2000 "$1" > "$1.$$.tmp" ) 2>/dev/null \
    && cat "$1.$$.tmp" > "$1" 2>/dev/null
  rm -f "$1.$$.tmp"
  return 0
}

# Éxito si $1 (archivo, carpeta o symlink, también colgante) se modificó hace más de $2 minutos.
# `find` sin -L mira el propio symlink, no su destino.
graphify_lock_older() {
  [ -n "$(find "$1" -maxdepth 0 -mmin +"$2" 2>/dev/null)" ]
}

# Éxito si el lock $1 es «viejo» y se puede quitar:
# - no es una carpeta (un archivo, o un symlink, también colgante) y tiene más de $2 minutos;
# - es una carpeta y su dueño (el PID de $1/pid) ya no existe;
# - es una carpeta sin PID legible (su dueño murió antes de escribirlo) y tiene más de $2 minutos;
# - su dueño sigue vivo, pero el lock tiene más de ${GRAPHIFY_LOCK_MAX_MIN:-120} minutos. Es un
#   tope de seguridad (un PID reutilizado por otro proceso, o una instalación colgada): un lock
#   con su dueño vivo no se roba nunca por edad antes de ese tope.
graphify_lock_stale() {
  if [ -L "$1" ] || { [ -e "$1" ] && [ ! -d "$1" ]; }; then
    graphify_lock_older "$1" "$2"
    return
  fi
  [ -d "$1" ] || return 1
  _sp=$(cat "$1/pid" 2>/dev/null)
  case "$_sp" in
    ''|*[!0-9]*) graphify_lock_older "$1" "$2"; return ;;
  esac
  kill -0 "$_sp" 2>/dev/null || return 0
  graphify_lock_older "$1" "${GRAPHIFY_LOCK_MAX_MIN:-120}"
}

# Quita el lock $1 si es viejo. La recuperación es exclusiva (otro lock, $1.recover): sin ella,
# dos procesos que ven el mismo lock viejo podrían borrarse uno al otro el lock recién tomado.
# `rm -rf` sobre un symlink (sin barra final) quita el enlace, no su destino.
graphify_lock_recover() {
  [ -e "$1" ] || [ -L "$1" ] || return 0
  graphify_lock_stale "$1" "${GRAPHIFY_LOCK_STALE_MIN:-15}" || return 0
  if ! mkdir "$1.recover" 2>/dev/null; then
    # Un recuperador que murió dejaría esto para siempre.
    if graphify_lock_stale "$1.recover" 2; then rm -rf "$1.recover"; fi
    return 0
  fi
  if graphify_lock_stale "$1" "${GRAPHIFY_LOCK_STALE_MIN:-15}"; then rm -rf "$1"; fi
  rmdir "$1.recover" 2>/dev/null
  return 0
}

# Escribe <valor> en <lock>/<nombre> de forma atómica (temporal y mv dentro del lock).
graphify_lock_write() {
  printf '%s\n' "$3" > "$1/$2.$$.tmp" 2>/dev/null && mv -f "$1/$2.$$.tmp" "$1/$2" 2>/dev/null
}

# Libera el lock $1 solo si su token es $2: un lock que otro tomó (porque este se dio por viejo)
# no se borra. Queda una ventana mínima entre la lectura del token y el `rm`.
graphify_lock_release() {
  if [ -d "$1" ] && [ ! -L "$1" ] && [ "$(cat "$1/token" 2>/dev/null)" = "$2" ]; then
    rm -rf "$1"
  fi
  return 0
}

# Token propio de un lock: PID, hora y 8 bytes aleatorios.
graphify_lock_token() {
  printf '%s-%s-%s\n' "$$" "$(date +%s)" "$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
}

# Éxito si <directorio> se puede pasar a `uv venv --clear`: no existe, o es una carpeta (no un
# symlink) vacía o con pyvenv.cfg. Cualquier otra cosa (un symlink, un archivo, una carpeta con
# contenido ajeno) se rechaza con un mensaje: --clear la vaciaría.
graphify_install_target_ok() {
  if [ -L "$1" ]; then
    echo "graphify_install: $1 es un enlace simbólico; no se toca (bórralo a mano si sobra)" >&2
    return 1
  fi
  [ -e "$1" ] || return 0
  if [ ! -d "$1" ]; then
    echo "graphify_install: $1 existe y no es una carpeta; no se toca (bórralo a mano si sobra)" >&2
    return 1
  fi
  [ -f "$1/pyvenv.cfg" ] && return 0
  if _tc=$(ls -A "$1" 2>/dev/null) && [ -z "$_tc" ]; then
    return 0
  fi
  echo "graphify_install: $1 existe y no es un venv (no tiene pyvenv.cfg); no se toca (revísala y bórrala a mano si sobra)" >&2
  return 1
}

# Reemplaza al proceso actual por uv (<ruta de uv> <argumentos...>) con entorno limpio: la lista
# blanca común (graphify_env_exec) más lo mínimo que uv necesita, si están definidas:
# - XDG_CACHE_HOME: dónde está la caché de uv (si no, ~/.cache/uv, con HOME).
# - XDG_DATA_HOME: dónde guarda uv los Pythons que descarga (si no, ~/.local/share/uv/python).
# - Proxy y certificados (GRAPHIFY_UV_NET): HTTPS_PROXY, HTTP_PROXY, ALL_PROXY, NO_PROXY, sus
#   variantes en minúsculas, SSL_CERT_FILE, SSL_CERT_DIR y UV_NATIVE_TLS. Solo cambian POR
#   DÓNDE pasa el tráfico, no DE DÓNDE se baja graphifyy; sin ellas la instalación falla detrás
#   de un proxy (la nube de Claude Code incluida).
# Nada más: ni el resto de UV_* (UV_INDEX_URL, UV_PYTHON_INSTALL_MIRROR…) ni PIP_*
# (PIP_INDEX_URL…), que cambiarían de dónde baja graphifyy. Quien llama agrega --no-config:
# así tampoco lee uv.toml ni pyproject.toml.
# El PATH es el fijo: uv no ve el Python de Homebrew ni de pyenv y usa uno propio (lo descarga
# la primera vez). Se llama dentro de un subshell, como graphify_env_exec.
GRAPHIFY_UV_NET="HTTPS_PROXY HTTP_PROXY ALL_PROXY NO_PROXY https_proxy http_proxy all_proxy no_proxy SSL_CERT_FILE SSL_CERT_DIR UV_NATIVE_TLS"
graphify_uv_exec() {
  _ux=$1
  shift
  set -- /bin/sh -c 'exec "$0" "$@"' "$_ux" "$@"
  [ -z "${XDG_DATA_HOME+x}" ] || set -- "XDG_DATA_HOME=$XDG_DATA_HOME" "$@"
  [ -z "${XDG_CACHE_HOME+x}" ] || set -- "XDG_CACHE_HOME=$XDG_CACHE_HOME" "$@"
  # Los nombres son los fijos de GRAPHIFY_UV_NET: el eval nunca ve un valor, solo el nombre.
  for _un in $GRAPHIFY_UV_NET; do
    eval "[ -z \"\${$_un+x}\" ] || set -- \"$_un=\$$_un\" \"\$@\""
  done
  graphify_env_exec "$@"
}

# Instala graphifyy==<versión> en <directorio> (…/club-colina-graphify/<versión>). Única
# implementación: la usan scripts/setup-dev.sh y el hook SessionStart de la nube.
# GRAPHIFY_NO_INSTALL=1 la desactiva (la batería de los hooks nunca debe instalar). Devuelve 0
# si al final el binario da la versión pedida.
# - La versión se valida igual que en graphify_version (X.Y.Z estricto) y la ruta debe ser
#   absoluta y terminar en /club-colina-graphify/<versión>: nada más llega a `uv venv --clear`.
# - Lock: mkdir "<directorio>.lock" (atómico y portable, sin flock). Si dos procesos instalan la
#   misma versión por primera vez a la vez, uno espera al otro (hasta ${GRAPHIFY_LOCK_WAIT:-300} s)
#   en vez de correr los dos `uv venv --clear` sobre la misma carpeta. Dentro del lock se vuelve
#   a comprobar --version: quien esperaba suele encontrar la instalación hecha y no instala nada.
# - El lock lleva un token propio y un PID. El PID es el del subshell instalador (el que corre
#   uv y vive toda la instalación), no el de quien llama. Un lock con su dueño vivo no se roba
#   por edad salvo pasado el tope de seguridad (graphify_lock_stale); uno con su dueño muerto o
#   que no es una carpeta se recupera (graphify_lock_recover).
# - Liberación: el trap EXIT del instalador y, al volver, quien llama; los dos solo si el token
#   es el propio (graphify_lock_release), así nunca se borra un lock que ya es de otro.
# - Señales: quien llama atrapa TERM, INT y HUP, mata al instalador (que a su vez mata a uv) y
#   libera el lock. uv corre en segundo plano con `wait` en los dos niveles para que el trap
#   llegue mientras uv trabaja. Los traps de INT, TERM y HUP de quien llama quedan por defecto.
# - Antes de `uv venv --clear`, el destino tiene que poder vaciarse (graphify_install_target_ok).
# - uv corre con entorno limpio y --no-config (graphify_uv_exec).
graphify_install() {
  _iver=$1
  _idir=$2
  graphify_version_valid "$_iver" || { echo "graphify_install: versión inválida (debe ser X.Y.Z)" >&2; return 1; }
  case "$_idir" in /*/club-colina-graphify/"$_iver") ;; *) echo "graphify_install: ruta inesperada" >&2; return 1 ;; esac
  if [ "${GRAPHIFY_NO_INSTALL:-}" = "1" ]; then
    echo "graphify_install: instalación desactivada (GRAPHIFY_NO_INSTALL=1)" >&2
    return 1
  fi
  _iuv=$(command -v uv 2>/dev/null) || { echo "graphify_install: falta uv" >&2; return 1; }
  case "$_iuv" in /*) ;; *) echo "graphify_install: uv no es un ejecutable con ruta absoluta" >&2; return 1 ;; esac
  mkdir -p "$(dirname "$_idir")" || return 1
  _lock="$_idir.lock"
  _itok=$(graphify_lock_token)
  _waited=0
  until mkdir "$_lock" 2>/dev/null; do
    graphify_lock_recover "$_lock"
    if [ "$_waited" -ge "${GRAPHIFY_LOCK_WAIT:-300}" ]; then
      echo "graphify_install: sin lock tras $_waited s ($_lock)" >&2
      return 1
    fi
    sleep 1
    _waited=$((_waited + 1))
  done
  # Mientras no se lanza el instalador, el PID es el de quien llama (vivo).
  graphify_lock_write "$_lock" token "$_itok"
  graphify_lock_write "$_lock" pid "$$"
  (
    _iuvp=""
    trap 'graphify_lock_release "$_lock" "$_itok"' EXIT
    trap '_graphify_install_child_signal' INT TERM HUP
    if graphify_version_ok "$_idir/bin/graphify" "$_iver"; then
      echo "graphify_install: ya estaba instalada (otro proceso la hizo mientras esperaba)"
      exit 0
    fi
    graphify_install_target_ok "$_idir" || exit 1
    cd "$(dirname "$_idir")" || exit 1
    _graphify_install_uv venv --no-config --python ">=3.10" --clear "$_idir" || exit 1
    _graphify_install_uv pip install --no-config --python "$_idir/bin/python" "graphifyy==$_iver" || exit 1
    graphify_version_ok "$_idir/bin/graphify" "$_iver" || exit 1
    echo "graphify_install: instalada en $_idir"
  ) &
  _ichild=$!
  graphify_lock_write "$_lock" pid "$_ichild"
  trap '_graphify_install_signal 130' INT
  trap '_graphify_install_signal 143' TERM
  trap '_graphify_install_signal 129' HUP
  wait "$_ichild" && _irc=0 || _irc=$?
  trap - INT TERM HUP
  # Por si el instalador murió sin su trap (kill -9): el token dice si el lock sigue siendo propio.
  graphify_lock_release "$_lock" "$_itok"
  return "$_irc"
}

# uv en segundo plano dentro del instalador, con su PID en _iuvp para el trap.
_graphify_install_uv() {
  ( graphify_uv_exec "$_iuv" "$@" ) &
  _iuvp=$!
  wait "$_iuvp" && _iuvr=0 || _iuvr=$?
  _iuvp=""
  return "$_iuvr"
}

_graphify_install_child_signal() {
  trap - INT TERM HUP
  if [ -n "$_iuvp" ]; then
    kill -TERM "$_iuvp" 2>/dev/null
    wait "$_iuvp" 2>/dev/null
  fi
  exit 1
}

_graphify_install_signal() {
  trap - INT TERM HUP
  kill -TERM "$_ichild" 2>/dev/null
  wait "$_ichild" 2>/dev/null
  graphify_lock_release "$_lock" "$_itok"
  exit "$1"
}

# Lee paths por stdin; éxito si al menos uno es algo que graphify indexaría. Usa el propio
# .graphifyignore (misma semántica que graphify: un patrón como docs/ vale en cualquier
# nivel), y no una lista de extensiones que habría que mantener a mano: un grafo viejo es
# el error caro; una reconstrucción de más, el barato. Con -n, lo que no calza con ninguna
# regla sale con «::» en la primera columna. Ante un fallo de git, mejor reconstruir.
graphify_relevant() {
  _paths=$(cat)
  [ -n "$_paths" ] || return 1
  _rroot=$(graphify_root) || return 0
  _out=$(printf '%s\n' "$_paths" | git -C "$_rroot" -c core.quotePath=false \
    -c core.excludesFile="$_rroot/.graphifyignore" check-ignore --no-index -v -n --stdin 2>/dev/null)
  [ $? -le 1 ] || return 0
  printf '%s\n' "$_out" | awk -F'\t' '
    ($1 == "::" || $1 ~ /:[0-9]+:!/) && $2 != ".graphifyignore" && $2 != ".graphify-version" { found = 1 }
    END { exit(found ? 0 : 1) }'
}

# Estado de un rebase en curso, para decidir quién reconstruye:
#   none     no hay rebase en curso.
#   pending  le quedan commits por reaplicar: post-rewrite reconstruirá al terminar.
#   idle     no queda nada por reaplicar (avance rápido, o todo `drop`): post-rewrite no se
#            ejecuta, y el único hook que ve el cambio es el post-checkout que mueve HEAD a la
#            base nueva. Git escribe la lista de tareas (git-rebase-todo) antes de ese checkout.
# Con el backend merge (el de por defecto) se mira si la lista tiene alguna orden que crea un
# commit (pick, reword, edit, squash, fixup, merge, con sus abreviaturas); con --apply, los
# parches que faltan (next <= last).
graphify_rebase_state() {
  _rgd=$(git rev-parse --git-dir 2>/dev/null) || { echo none; return 0; }
  if [ -d "$_rgd/rebase-merge" ]; then
    if [ -f "$_rgd/rebase-merge/git-rebase-todo" ] && awk '
      $1 ~ /^(pick|p|reword|r|edit|e|squash|s|fixup|f|merge|m)$/ { found = 1 }
      END { exit(found ? 0 : 1) }' "$_rgd/rebase-merge/git-rebase-todo"; then
      echo pending
    else
      echo idle
    fi
  elif [ -d "$_rgd/rebase-apply" ]; then
    _next=$(cat "$_rgd/rebase-apply/next" 2>/dev/null)
    _last=$(cat "$_rgd/rebase-apply/last" 2>/dev/null)
    if [ -n "$_next" ] && [ -n "$_last" ] && [ "$_next" -le "$_last" ] 2>/dev/null; then
      echo pending
    else
      echo idle
    fi
  else
    echo none
  fi
}

# Salidas tempranas comunes. Devuelve 0 si el hook debe seguir; si no, avisa lo que
# corresponda y devuelve 1 (el hook sale con 0 de todos modos). Un argumento dice que el hook
# corre justo al final de una operación, cuando git aún no borra su carpeta o archivo de
# estado, y que ese estado no cuenta como «operación en curso»; sin eso el hook se saltaría
# siempre:
#   merge   MERGE_HEAD (post-merge).
#   rebase  rebase-merge y rebase-apply (post-rewrite; post-checkout con un rebase sin nada
#           que reaplicar).
#   am      rebase-apply (`git am` lo usa) y, como commit, CHERRY_PICK_HEAD y REVERT_HEAD
#           (post-applypatch).
#   commit  CHERRY_PICK_HEAD (post-commit): un cherry-pick sin conflicto crea su commit con
#           ese archivo aún presente. La excepción de REVERT_HEAD es DEFENSIVA: con git 2.50
#           un revert sin conflicto no deja REVERT_HEAD cuando corre post-commit, y hoy
#           ningún caso de la batería la ejercita (el de revert es solo de regresión).
graphify_precheck() {
  [ "${GRAPHIFY_SKIP_HOOK:-}" = "1" ] && return 1
  _gd=$(git rev-parse --git-dir 2>/dev/null) || return 1
  for _m in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
    case "$_m:${1:-}" in
      rebase-merge:rebase|rebase-apply:rebase|rebase-apply:am|MERGE_HEAD:merge) continue ;;
      CHERRY_PICK_HEAD:commit|CHERRY_PICK_HEAD:am|REVERT_HEAD:commit|REVERT_HEAD:am) continue ;;
    esac
    [ -e "$_gd/$_m" ] && return 1
  done
  _bin=$(graphify_bin) || _bin=""
  _root=$(graphify_root)
  if [ -z "$_bin" ] || [ ! -x "$_bin" ] || [ ! -f "$_root/graphify-out/graph.json" ]; then
    if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
      echo "[graphify] el grafo se está preparando en segundo plano; si no aparece, revisa $(graphify_log "$_root")"
    else
      echo "[graphify] sin grafo local: corre scripts/setup-dev.sh"
    fi
    return 1
  fi
  return 0
}

# Reconstruye en segundo plano con `graphify update .` (solo AST, sin LLM). El log registra
# qué binario corrió y desde qué directorio, al empezar y al terminar.
# La salida de graphify pasa por graphify_filter (graphify_exec_filtered) antes de llegar al log:
# los agentes leen ese log, y sin filtro les llegaría la sugerencia de graphify «run /graphify
# --update in your AI assistant». El rc de graphify se conserva y llega a «=== fin rc=…».
graphify_rebuild() {
  _bin=$(graphify_bin) || return 0
  _rroot=$(graphify_root)
  [ -n "$_rroot" ] || return 0
  _log=$(graphify_log "$_rroot") || return 0
  graphify_log_init "$_log" || return 0
  graphify_log_trim "$_log"
  echo "[graphify] reconstruyendo en segundo plano (log: $_log)"
  cd "$_rroot" 2>/dev/null || return 0
  nohup sh -c '. "$1"; echo "=== $(date) bin=$2 cwd=$(pwd)"; graphify_exec_filtered "$2" update .; echo "=== fin rc=$? cwd=$(pwd)"' \
    sh "$_rroot/.githooks/lib-graphify.sh" "$_bin" >> "$_log" 2>&1 < /dev/null &
  return 0
}
