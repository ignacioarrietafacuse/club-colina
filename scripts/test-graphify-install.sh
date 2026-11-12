#!/bin/sh
# Prueba de graphify_install (.githooks/lib-graphify.sh): la instalación con lock.
# POSIX sh. Todo ocurre en un temporal: XDG_DATA_HOME apunta a una carpeta del temporal y la
# instalación real de graphify no se toca (se comprueba al final que su carpeta y su binario
# siguen idénticos). Dos partes:
#
# A. Con un uv falso (sin red, rápido; ver «uv falso» abajo):
#    - H10 entorno de uv: con UV_INDEX_URL, PIP_INDEX_URL y otras exportadas, uv no las recibe;
#      las de proxy y certificados (GRAPHIFY_UV_NET) sí; las dos llamadas llevan --no-config.
#    - H4 versión estricta: «..», «.», «1..2» y otras dan rc 1 sin llamar a uv.
#    - H5 destino: un symlink, un archivo y una carpeta con un archivo ajeno quedan intactos
#      (rc distinto de 0 y un mensaje); una carpeta vacía y un venv viejo sí se instalan.
#    - H3 lock: el PID guardado es el del instalador (el padre de uv); con un dueño vivo y lento,
#      un segundo proceso espera y no corre otro `venv --clear`, aunque el lock sea «viejo» por
#      edad; el dueño no borra un lock que ya no es suyo; kill -TERM al shell dueño no deja uv
#      huérfano y libera el lock; un PID muerto y un kill -9 se recuperan; el tope de seguridad.
#    - H9 un <versión>.lock que no es carpeta (archivo, symlink colgante) se recupera según su edad.
# B. Con el uv real (usa la red):
#    1. Cinco rondas de dos instalaciones en paralelo (procesos `sh` distintos, como dos
#       worktrees de Conductor): las diez deben terminar con rc 0 y el binario debe dar la
#       versión exacta.
#    2. Un lock viejo (su dueño ya no existe) se recupera y la instalación termina.
#    3. Un lock vivo que no se libera: la espera tiene tope y falla con rc 1 sin tocar nada.
# Imprime el rc y el tiempo (s) de cada caso. Sale con código distinto de 0 si algo falló.
SRC=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd -P) || exit 1
[ -f "$SRC/.graphify-version" ] || { echo "Error: corre esto desde un clon de Club Colina." >&2; exit 1; }
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_PREFIX GIT_CEILING_DIRECTORIES
# GRAPHIFY_BIN y GRAPHIFY_ALLOW_TEST_BIN se quitan: esta prueba no usa un binario de prueba (las
# dos están en `deny` de .claude/settings.json y solo las fijan las baterías, dentro del script).
unset CLAUDE_CODE_REMOTE GRAPHIFY_SKIP_HOOK GRAPHIFY_BIN GRAPHIFY_ALLOW_TEST_BIN GRAPHIFY_OUT \
  GRAPHIFY_NO_INSTALL GRAPHIFY_LOCK_WAIT GRAPHIFY_LOCK_STALE_MIN GRAPHIFY_LOCK_MAX_MIN

LIB="$SRC/.githooks/lib-graphify.sh"
# shellcheck source=../.githooks/lib-graphify.sh
. "$LIB"
VER=$(graphify_version "$SRC") || { echo "ABORTO: .graphify-version debe contener solo X.Y.Z." >&2; exit 2; }
command -v uv >/dev/null 2>&1 || { echo "ABORTO: falta uv." >&2; exit 2; }

REAL_DATA=$(graphify_data_home) || { echo "ABORTO: XDG_DATA_HOME relativa o HOME vacío." >&2; exit 2; }
REALDIR="$REAL_DATA/club-colina-graphify/$VER"
real_state() { { ls -ld "$REALDIR"; ls -l "$REALDIR/bin/graphify"; } 2>&1; }
REAL_ANTES=$(real_state)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/graphify-install.XXXXXX") || exit 1
TMPREAL=$(cd "$TMP" && pwd -P) || exit 1
case "$TMPREAL" in /?*) ;; *) echo "Error: temporal inválido: $TMPREAL" >&2; exit 1 ;; esac
trap 'cd /; case "$TMPREAL" in /?*) rm -rf "$TMPREAL" && echo "Temporal borrado: $TMPREAL" ;; esac' EXIT
trap 'exit 130' INT TERM

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
ko() { FAIL=$((FAIL + 1)); printf 'FAIL  %s  -> %s\n' "$1" "$2"; }
flat() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-400; }
# Un zombi (Z) cuenta como muerto: kill -0 responde bien mientras espera a que su padre (o el init)
# lo recoja, y en Linux eso puede tardar 1-2 s. Sin estado en ps, ya terminó.
vivo() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null || return 1
  case "$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')" in ''|Z*) return 1 ;; esac
}
# Espera (décimas de segundo) a que exista el archivo $1 con contenido.
espera_archivo() { _e=0; while [ "$_e" -lt "${2:-100}" ] && [ ! -s "$1" ]; do sleep 0.1; _e=$((_e + 1)); done; [ -s "$1" ]; }
# Espera (décimas) a que el PID $1 termine.
espera_fin() { _e=0; while [ "$_e" -lt "${2:-100}" ] && vivo "$1"; do sleep 0.1; _e=$((_e + 1)); done; ! vivo "$1"; }
ahora() { date +%s; }
# Tope de los casos H3 que miden tiempo (kill -TERM, PID muerto, kill -9 a todo). Lo que el caso
# exige es que no queden huérfanos y que el lock se libere, no una velocidad: el tope solo separa
# «se recuperó» de «esperó a un sleep de 30 s o al tope del lock». Con 3 s, y dos baterías en
# paralelo en la misma máquina, falló 2 veces en 8 corridas (4 s); 10 s sigue muy por debajo de 30.
H3_TOPE=10

echo "== graphify: prueba de la instalación (versión $VER)"
echo "temporal: $TMPREAL"
echo "instalación real (no se toca): $REALDIR"

# ======================================================================================
# A. uv falso
# ======================================================================================
# El uv falso corre con el entorno limpio de graphify_uv_exec: no ve ninguna variable de la
# prueba, así que lee su control de una carpeta fija ($CTL, escrita en la primera línea).
# - Anota cada llamada en $CTL/calls («pid ppid argumentos») y los NOMBRES de su entorno en
#   $CTL/env.<pid> (nunca los valores).
# - venv: escribe su PID y el de su padre ($CTL/uv.pid, $CTL/uv.ppid), duerme lo que diga
#   $CTL/sleep (en segundo plano, con trap: un TERM lo corta sin dejar el sleep vivo), y hace lo
#   que haría --clear: borra el destino y crea un venv mínimo con pyvenv.cfg.
# - pip install: crea bin/graphify, que responde «graphify <versión>» a --version.
CTL="$TMPREAL/ctl"
FUV="$TMPREAL/fakeuv"
mkdir -p "$CTL" "$FUV"
{
  echo '#!/bin/sh'
  printf "CTL='%s'\n" "$CTL"
  cat <<'EOF'
echo "$$ $PPID $*" >> "$CTL/calls"
env | cut -d= -f1 | sort > "$CTL/env.$$"
case "$1" in
  venv)
    for a; do d=$a; done
    echo "$$" > "$CTL/uv.pid"
    echo "$PPID" > "$CTL/uv.ppid"
    s=$(cat "$CTL/sleep" 2>/dev/null)
    if [ -n "$s" ] && [ "$s" != 0 ]; then
      # El trap va antes de lanzar sleep: un TERM justo después del `&` no deja el sleep huérfano.
      sp=""
      trap '[ -n "$sp" ] && kill "$sp" 2>/dev/null; exit 143' TERM INT HUP
      sleep "$s" &
      sp=$!
      echo "$sp" > "$CTL/sleep.pid"
      wait "$sp"
    fi
    rm -rf "$d"
    mkdir -p "$d/bin"
    echo "home = /uv-falso" > "$d/pyvenv.cfg"
    ;;
  pip)
    py=""; v=""; prev=""
    for a; do
      [ "$prev" = --python ] && py=$a
      case "$a" in graphifyy==*) v=${a#graphifyy==} ;; esac
      prev=$a
    done
    d=$(dirname "$(dirname "$py")")
    printf '#!/bin/sh\necho "graphify %s"\n' "$v" > "$d/bin/graphify"
    chmod +x "$d/bin/graphify"
    ;;
esac
exit 0
EOF
} > "$FUV/uv"
chmod +x "$FUV/uv"

# Llamadas a uv (que calzan con $1), 0 si no hubo ninguna.
ncalls() { if [ -f "$CTL/calls" ]; then grep -c -- "${1:-.}" "$CTL/calls"; else echo 0; fi; }
reset_ctl() { rm -f "$CTL"/*; }
dirx() { printf '%s/%s/club-colina-graphify/%s' "$TMPREAL" "$1" "${2:-$VER}"; }

# graphify_install en un `sh` aparte, con el uv falso primero en el PATH:
#   inst <caso> [versión] [VAR=valor...]   (en primer plano; salida en $TMPREAL/out.<caso>)
#   inst_bg igual, en segundo plano: $! es el PID del `sh` dueño.
inst() {
  _c=$1; _v=${2:-$VER}; shift; [ $# -gt 0 ] && shift
  env "$@" PATH="$FUV:$PATH" XDG_DATA_HOME="$TMPREAL/$_c" \
    sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$_v" \
    > "$TMPREAL/out.$_c" 2>&1
}
inst_bg() {
  _c=$1; _v=${2:-$VER}; shift; [ $# -gt 0 ] && shift
  ( exec env "$@" PATH="$FUV:$PATH" XDG_DATA_HOME="$TMPREAL/$_c" \
    sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$_v" ) \
    > "$TMPREAL/out.$_c" 2>&1 &
}
salida() { flat "$(cat "$TMPREAL/out.$1" 2>/dev/null)"; }

echo
echo "== A. uv falso ($FUV/uv)"

# ---- H10: entorno de uv ---------------------------------------------------------------
reset_ctl
t0=$(ahora)
# Las de proxy y certificados (GRAPHIFY_UV_NET, de la lib) se exportan todas con valores falsos:
# deben llegar a uv. El uv falso no usa la red, así que los valores no importan.
(
  for _n in $GRAPHIFY_UV_NET; do export "$_n=valor-falso-$_n"; done
  UV_INDEX_URL=https://indice-falso.invalid/simple PIP_INDEX_URL=https://indice-falso.invalid/pip \
    UV_EXTRA_INDEX_URL=https://indice-falso.invalid/extra UV_PYTHON_INSTALL_MIRROR=https://espejo-falso.invalid \
    UV_CONFIG_FILE=/tmp/uv-falso.toml ANTHROPIC_API_KEY=clave-falsa inst h10env
)
rc=$?
dt=$(( $(ahora) - t0 ))
envs=$(cat "$CTL"/env.* 2>/dev/null | sort -u | tr '\n' ' ')
# Prohibidas: toda UV_* y PIP_* salvo UV_NATIVE_TLS, y ANTHROPIC_*.
prohibidas=$(cat "$CTL"/env.* 2>/dev/null | grep -E '^(UV_|PIP_|ANTHROPIC_)' | grep -vx UV_NATIVE_TLS | sort -u | tr '\n' ' ')
# Faltantes: cada llamada (venv y pip) debe recibir todas las de GRAPHIFY_UV_NET.
faltan=""
for _f in "$CTL"/env.*; do
  for _n in $GRAPHIFY_UV_NET; do grep -qx "$_n" "$_f" || faltan="$faltan $_n(${_f##*.})"; done
done
sin_noconfig=$(grep -vc -- '--no-config' "$CTL/calls" 2>/dev/null || true)
echo "  llamadas a uv: $(tr '\n' '|' < "$CTL/calls" | sed "s#$TMPREAL#<tmp>#g")"
echo "  variables que recibió uv (solo nombres): $envs"
if [ "$rc" = 0 ] && [ -z "$prohibidas" ] && [ -z "$faltan" ] && [ "$(ncalls)" = 2 ] && [ "$sin_noconfig" = 0 ] \
   && graphify_version_ok "$(dirx h10env)/bin/graphify" "$VER"; then
  ok "H10 uv: con UV_INDEX_URL, PIP_INDEX_URL, UV_EXTRA_INDEX_URL, UV_PYTHON_INSTALL_MIRROR, UV_CONFIG_FILE y ANTHROPIC_API_KEY exportadas, uv no recibe ninguna; las $(echo $GRAPHIFY_UV_NET | wc -w | tr -d ' ') de proxy y certificados ($GRAPHIFY_UV_NET) llegan a las dos llamadas; venv y pip llevan --no-config (rc 0, ${dt} s)"
else
  ko "H10 uv: entorno limpio" "rc=$rc recibió: [$prohibidas] faltan:[$faltan] llamadas sin --no-config: $sin_noconfig; $(salida h10env)"
fi

# ---- H4: versión estricta -------------------------------------------------------------
for v in .. . 1..2 1.2 1.2.3.4 '1.2.3 ' 'a.b.c' '1.2.3/../x'; do
  reset_ctl
  out=$(env PATH="$FUV:$PATH" XDG_DATA_HOME="$TMPREAL/h4" sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$v" 2>&1)
  rc=$?
  if [ "$rc" = 1 ] && [ "$(ncalls)" = 0 ] && printf '%s' "$out" | grep -q 'versión inválida' && [ ! -e "$TMPREAL/h4" ]; then
    ok "H4 versión «${v}»: rc 1, «versión inválida», sin llamar a uv y sin crear nada"
  else
    ko "H4 versión «${v}»" "rc=$rc llamadas a uv=$(ncalls) salida: $(flat "$out")"
  fi
done

# ---- H5: destino que no se puede vaciar -----------------------------------------------
# a) symlink a una carpeta con un archivo ajeno.
reset_ctl
d=$(dirx h5link)
mkdir -p "$(dirname "$d")" "$TMPREAL/ajena"
echo "dato ajeno" > "$TMPREAL/ajena/ajeno.txt"
ln -s "$TMPREAL/ajena" "$d"
inst h5link; rc=$?
if [ "$rc" != 0 ] && [ -L "$d" ] && [ "$(cat "$TMPREAL/ajena/ajeno.txt")" = "dato ajeno" ] && [ "$(ls -A "$TMPREAL/ajena")" = ajeno.txt ] \
   && [ "$(ncalls)" = 0 ] && grep -q 'enlace simbólico' "$TMPREAL/out.h5link"; then
  ok "H5 destino symlink: rc $rc, mensaje «$(grep 'enlace simbólico' "$TMPREAL/out.h5link" | sed "s#$TMPREAL#<tmp>#g")», symlink y carpeta apuntada intactos, uv no se llama"
else
  ko "H5 destino symlink" "rc=$rc llamadas=$(ncalls) $(salida h5link)"
fi
[ -e "$d.lock" ] && ko "H5 symlink: lock" "quedó el lock"
# b) carpeta con un archivo ajeno (sin pyvenv.cfg).
reset_ctl
d=$(dirx h5dir)
mkdir -p "$d"
echo "otro dato" > "$d/ajeno.txt"
inst h5dir; rc=$?
if [ "$rc" != 0 ] && [ "$(ls -A "$d")" = ajeno.txt ] && [ "$(cat "$d/ajeno.txt")" = "otro dato" ] && [ "$(ncalls)" = 0 ] \
   && grep -q 'no es un venv' "$TMPREAL/out.h5dir" && [ ! -e "$d.lock" ]; then
  ok "H5 carpeta con un archivo ajeno: rc $rc, mensaje «$(grep 'no es un venv' "$TMPREAL/out.h5dir" | sed "s#$TMPREAL#<tmp>#g")», carpeta intacta, uv no se llama, lock liberado"
else
  ko "H5 carpeta con un archivo ajeno" "rc=$rc llamadas=$(ncalls) $(salida h5dir)"
fi
# c) un archivo en lugar de la carpeta.
reset_ctl
d=$(dirx h5file)
mkdir -p "$(dirname "$d")"
echo "archivo" > "$d"
inst h5file; rc=$?
if [ "$rc" != 0 ] && [ -f "$d" ] && [ "$(cat "$d")" = archivo ] && [ "$(ncalls)" = 0 ] && grep -q 'no es una carpeta' "$TMPREAL/out.h5file"; then
  ok "H5 un archivo en el destino: rc $rc, mensaje, archivo intacto, uv no se llama"
else
  ko "H5 un archivo en el destino" "rc=$rc llamadas=$(ncalls) $(salida h5file)"
fi
# d) carpeta vacía y venv viejo (con pyvenv.cfg, otra versión): sí se instalan.
reset_ctl
d=$(dirx h5vacia); mkdir -p "$d"
inst h5vacia; rc1=$?
d2=$(dirx h5viejo); mkdir -p "$d2/bin"; echo "home = /viejo" > "$d2/pyvenv.cfg"
printf '#!/bin/sh\necho "graphify 0.0.1"\n' > "$d2/bin/graphify"; chmod +x "$d2/bin/graphify"
inst h5viejo; rc2=$?
if [ "$rc1" = 0 ] && [ "$rc2" = 0 ] && graphify_version_ok "$d/bin/graphify" "$VER" && graphify_version_ok "$d2/bin/graphify" "$VER"; then
  ok "H5 carpeta vacía y venv de otra versión (con pyvenv.cfg): se instalan (rc 0 y 0)"
else
  ko "H5 carpeta vacía / venv viejo" "rc=$rc1/$rc2 $(salida h5vacia) $(salida h5viejo)"
fi

# ---- H3 a: dueño vivo y lento; el segundo espera y no hace --clear ---------------------
# GRAPHIFY_LOCK_STALE_MIN=0 en el segundo: por edad, el lock ya sería «viejo». Con su dueño vivo
# no se roba (solo pasado GRAPHIFY_LOCK_MAX_MIN, 120 min por defecto).
reset_ctl
echo 6 > "$CTL/sleep"
d=$(dirx h3c)
t0=$(ahora)
inst_bg h3c; pa=$!
espera_archivo "$CTL/uv.pid" || ko "H3 a" "el uv falso no arrancó"
lockpid=$(cat "$d.lock/pid" 2>/dev/null)
uvppid=$(cat "$CTL/uv.ppid")
uvpid=$(cat "$CTL/uv.pid")
echo "  dueño A: sh=$pa, PID en el lock=$lockpid, uv=$uvpid (su padre=$uvppid)"
if [ -n "$lockpid" ] && [ "$lockpid" = "$uvppid" ] && [ "$lockpid" != "$pa" ] && vivo "$lockpid"; then
  ok "H3 el PID del lock ($lockpid) es el del instalador que corre uv (padre de uv), no el del shell que llama ($pa)"
else
  ko "H3 PID del lock" "lock=$lockpid padre de uv=$uvppid shell=$pa"
fi
sleep 1
tb0=$(ahora)
( exec env GRAPHIFY_LOCK_STALE_MIN=0 PATH="$FUV:$PATH" XDG_DATA_HOME="$TMPREAL/h3c" \
    sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$VER" ) > "$TMPREAL/out.h3c2" 2>&1
rcb=$?
tb=$(( $(ahora) - tb0 ))
wait "$pa"; rca=$?
ta=$(( $(ahora) - t0 ))
venvs=$(ncalls ' venv ')
echo "  dueño A: rc $rca en ${ta} s | segundo B (lanzado 1 s después, STALE_MIN=0): rc $rcb en ${tb} s | llamadas a «uv venv»: $venvs"
if [ "$rca" = 0 ] && [ "$rcb" = 0 ] && [ "$venvs" = 1 ] && grep -q 'ya estaba instalada' "$TMPREAL/out.h3c2" \
   && [ "$tb" -ge 4 ] && [ ! -e "$d.lock" ]; then
  ok "H3 dueño vivo y lento: B espera ${tb} s, encuentra la instalación hecha y no corre otro venv --clear (1 sola llamada); lock liberado"
else
  ko "H3 dueño vivo y lento" "A rc=$rca B rc=$rcb venv=$venvs tb=$tb; B: $(salida h3c2)"
fi

# ---- H3 b: el dueño original no borra un lock que ya no es suyo ------------------------
reset_ctl
echo 4 > "$CTL/sleep"
d=$(dirx h3tok)
t0=$(ahora)
inst_bg h3tok; pa=$!
espera_archivo "$CTL/uv.pid" || ko "H3 b" "el uv falso no arrancó"
tok_dueno=$(cat "$d.lock/token")
# Otro proceso «tomó» el lock (como si este se hubiera dado por viejo): token y PID ajenos.
rm -rf "$d.lock"; mkdir "$d.lock"; echo "token-ajeno" > "$d.lock/token"; echo "$$" > "$d.lock/pid"
wait "$pa"; rca=$?
ta=$(( $(ahora) - t0 ))
if [ "$rca" = 0 ] && [ -d "$d.lock" ] && [ "$(cat "$d.lock/token")" = token-ajeno ] && [ -n "$tok_dueno" ]; then
  ok "H3 token: el dueño original termina (rc 0, ${ta} s) y no borra el lock ajeno (token del dueño ${tok_dueno%%-*}-…, el lock sigue con «token-ajeno»)"
else
  ko "H3 token" "rc=$rca lock=$([ -d "$d.lock" ] && cat "$d.lock/token" 2>/dev/null || echo 'BORRADO')"
fi
rm -rf "$d.lock"

# ---- H3 c: kill -TERM al shell dueño ---------------------------------------------------
reset_ctl
echo 30 > "$CTL/sleep"
d=$(dirx h3term)
inst_bg h3term; pa=$!
espera_archivo "$CTL/uv.pid" || ko "H3 c" "el uv falso no arrancó"
espera_archivo "$CTL/sleep.pid" 20
inst_pid=$(cat "$d.lock/pid"); uvpid=$(cat "$CTL/uv.pid"); slp=$(cat "$CTL/sleep.pid" 2>/dev/null)
t0=$(ahora)
kill -TERM "$pa"
wait "$pa"; rca=$?
espera_fin "$uvpid" 50
dt=$(( $(ahora) - t0 ))
echo "  kill -TERM a sh=$pa: rc $rca; instalador=$inst_pid vivo=$(vivo "$inst_pid" && echo sí || echo no); uv=$uvpid vivo=$(vivo "$uvpid" && echo sí || echo no); sleep del uv=$slp vivo=$(vivo "$slp" && echo sí || echo no); lock=$([ -e "$d.lock" ] && echo existe || echo liberado); ${dt} s"
if [ "$rca" = 143 ] && ! vivo "$inst_pid" && ! vivo "$uvpid" && ! vivo "$slp" && [ ! -e "$d.lock" ] && [ "$dt" -le "$H3_TOPE" ]; then
  ok "H3 kill -TERM al shell dueño: sale con 143 en ${dt} s, no quedan ni el instalador ni uv (ni su sleep), y el lock se libera"
else
  ko "H3 kill -TERM" "rc=$rca instalador vivo=$(vivo "$inst_pid" && echo sí || echo no) uv vivo=$(vivo "$uvpid" && echo sí || echo no) sleep=$slp vivo=$(vivo "$slp" && echo sí || echo no) lock=$([ -e "$d.lock" ] && echo existe || echo liberado) ${dt} s"
fi
for p in "$inst_pid" "$uvpid" "$slp"; do vivo "$p" && kill -9 "$p" 2>/dev/null; done

# ---- H3 d: un PID muerto se recupera ---------------------------------------------------
reset_ctl
d=$(dirx h3muerto)
mkdir -p "$d.lock"
sh -c 'echo $$' > "$d.lock/pid"   # un PID que ya no existe
echo "token-de-un-muerto" > "$d.lock/token"
t0=$(ahora)
inst h3muerto; rc=$?
dt=$(( $(ahora) - t0 ))
if [ "$rc" = 0 ] && graphify_version_ok "$d/bin/graphify" "$VER" && [ ! -e "$d.lock" ] && [ "$dt" -le "$H3_TOPE" ]; then
  ok "H3 lock con PID muerto: se recupera en ${dt} s, instala (rc 0) y libera"
else
  ko "H3 lock con PID muerto" "rc=$rc ${dt} s $(salida h3muerto)"
fi

# ---- H3 e: kill -9 -------------------------------------------------------------------------
# e1) kill -9 solo al shell que llama: el instalador sigue (su PID es el del lock), termina y
#     libera el lock él mismo.
reset_ctl
echo 3 > "$CTL/sleep"
d=$(dirx h3k9a)
inst_bg h3k9a; pa=$!
espera_archivo "$CTL/uv.pid" || ko "H3 e1" "el uv falso no arrancó"
inst_pid=$(cat "$d.lock/pid")
t0=$(ahora)
kill -9 "$pa"; wait "$pa" 2>/dev/null
espera_fin "$inst_pid" 100
dt=$(( $(ahora) - t0 ))
if ! vivo "$inst_pid" && [ ! -e "$d.lock" ] && graphify_version_ok "$d/bin/graphify" "$VER"; then
  ok "H3 kill -9 al shell que llama: el instalador ($inst_pid) termina la instalación y libera el lock (${dt} s después)"
else
  ko "H3 kill -9 al shell" "instalador vivo=$(vivo "$inst_pid" && echo sí || echo no) lock=$([ -e "$d.lock" ] && echo existe || echo liberado)"
fi
# e2) kill -9 a todo (shell, instalador, uv y su sleep), como un corte: el lock queda con un PID
#     muerto y el siguiente lo recupera.
reset_ctl
echo 30 > "$CTL/sleep"
d=$(dirx h3k9b)
inst_bg h3k9b; pa=$!
espera_archivo "$CTL/uv.pid" || ko "H3 e2" "el uv falso no arrancó"
espera_archivo "$CTL/sleep.pid" 20
inst_pid=$(cat "$d.lock/pid"); uvpid=$(cat "$CTL/uv.pid"); slp=$(cat "$CTL/sleep.pid" 2>/dev/null)
kill -9 "$pa" "$inst_pid" "$uvpid" $slp 2>/dev/null; wait "$pa" 2>/dev/null
espera_fin "$inst_pid" 20
quedo=$([ -d "$d.lock" ] && echo sí || echo no)
rm -f "$CTL/sleep"
t0=$(ahora)
inst h3k9b; rc=$?
dt=$(( $(ahora) - t0 ))
if [ "$quedo" = sí ] && [ "$rc" = 0 ] && graphify_version_ok "$d/bin/graphify" "$VER" && [ ! -e "$d.lock" ] && [ "$dt" -le "$H3_TOPE" ]; then
  ok "H3 kill -9 a todo: el lock quedó (PID $inst_pid muerto) y el siguiente lo recupera en ${dt} s, instala (rc 0) y libera"
else
  ko "H3 kill -9 a todo" "quedó el lock=$quedo rc=$rc ${dt} s $(salida h3k9b)"
fi

# ---- H3 f: tope de seguridad de un lock con su dueño vivo ------------------------------
reset_ctl
d=$(dirx h3tope)
mkdir -p "$d.lock"; echo "$$" > "$d.lock/pid"; echo "token-vivo" > "$d.lock/token"
t0=$(ahora)
inst h3tope "$VER" GRAPHIFY_LOCK_STALE_MIN=0 GRAPHIFY_LOCK_WAIT=3; rc1=$?
dt1=$(( $(ahora) - t0 ))
intacto=$([ "$(cat "$d.lock/token" 2>/dev/null)" = token-vivo ] && echo sí || echo no)
sleep 1
t0=$(ahora)
inst h3tope "$VER" GRAPHIFY_LOCK_MAX_MIN=0; rc2=$?
dt2=$(( $(ahora) - t0 ))
if [ "$rc1" = 1 ] && [ "$intacto" = sí ]; then
  ok "H3 tope: con el dueño vivo y STALE_MIN=0 el lock no se roba por edad (rc 1 a los ${dt1} s, lock intacto)"
else
  ko "H3 tope (antes del tope)" "rc=$rc1 intacto=$intacto"
fi
if [ "$rc2" = 0 ] && [ ! -e "$d.lock" ] && graphify_version_ok "$d/bin/graphify" "$VER"; then
  ok "H3 tope: pasado el tope de seguridad (GRAPHIFY_LOCK_MAX_MIN=0) sí se recupera e instala (rc 0, ${dt2} s)"
else
  ko "H3 tope (pasado el tope)" "rc=$rc2 $(salida h3tope)"
fi

# ---- H9: un <versión>.lock que no es carpeta -------------------------------------------
# a) archivo reciente: no se toca (se comprueba su edad) y la espera termina con rc 1.
reset_ctl
d=$(dirx h9a); mkdir -p "$(dirname "$d")"; echo basura > "$d.lock"
t0=$(ahora)
inst h9a "$VER" GRAPHIFY_LOCK_WAIT=3; rc=$?
dt=$(( $(ahora) - t0 ))
if [ "$rc" = 1 ] && [ -f "$d.lock" ] && [ "$(ncalls)" = 0 ]; then
  ok "H9 lock que es un archivo reciente: no se borra (más nuevo que STALE_MIN), espera ${dt} s y sale con rc 1"
else
  ko "H9 archivo reciente" "rc=$rc $(salida h9a)"
fi
# b) archivo viejo: se recupera.
reset_ctl
touch -t 202001010000 "$d.lock"
t0=$(ahora)
inst h9a; rc=$?
dt=$(( $(ahora) - t0 ))
if [ "$rc" = 0 ] && [ ! -e "$d.lock" ] && graphify_version_ok "$d/bin/graphify" "$VER"; then
  ok "H9 lock que es un archivo viejo: se recupera en ${dt} s e instala (rc 0)"
else
  ko "H9 archivo viejo" "rc=$rc $(salida h9a)"
fi
# c) symlink colgante viejo: se recupera (se quita el enlace).
reset_ctl
d=$(dirx h9c); mkdir -p "$(dirname "$d")"
ln -s "$TMPREAL/no-existe" "$d.lock"
touch -h -t 202001010000 "$d.lock"
t0=$(ahora)
inst h9c; rc=$?
dt=$(( $(ahora) - t0 ))
if [ "$rc" = 0 ] && [ ! -e "$d.lock" ] && [ ! -L "$d.lock" ] && graphify_version_ok "$d/bin/graphify" "$VER"; then
  ok "H9 lock que es un symlink colgante viejo: se recupera en ${dt} s e instala (rc 0)"
else
  ko "H9 symlink colgante" "rc=$rc $(salida h9c)"
fi
# d) symlink viejo a una carpeta ajena: se quita el enlace, la carpeta queda intacta.
reset_ctl
d=$(dirx h9d); mkdir -p "$(dirname "$d")" "$TMPREAL/ajena2"; echo dato > "$TMPREAL/ajena2/f"
ln -s "$TMPREAL/ajena2" "$d.lock"
touch -h -t 202001010000 "$d.lock"
inst h9d; rc=$?
if [ "$rc" = 0 ] && [ ! -L "$d.lock" ] && [ "$(cat "$TMPREAL/ajena2/f")" = dato ] && [ "$(ls -A "$TMPREAL/ajena2")" = f ]; then
  ok "H9 lock que es un symlink viejo a una carpeta: se quita el enlace (rc 0) y la carpeta apuntada queda intacta"
else
  ko "H9 symlink a carpeta" "rc=$rc $(salida h9d)"
fi

# ======================================================================================
# B. uv real
# ======================================================================================
echo
echo "== B. uv real ($(command -v uv))"
dir_de() { printf '%s/%s/club-colina-graphify/%s' "$TMPREAL" "$1" "$VER"; }

# Una instalación en un proceso aparte: guarda «rc segundos» en res.<ronda>.<id>.
lanza() { # ronda id
  (
    _t0=$(date +%s)
    XDG_DATA_HOME="$TMPREAL/$1" sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$VER" > "$TMPREAL/salida.$1.$2" 2>&1
    _rc=$?
    echo "$_rc $(( $(date +%s) - _t0 ))" > "$TMPREAL/res.$1.$2"
  ) &
}

for ronda in 1 2 3 4 5; do
  # XDG_DATA_HOME cambia lo que ve uv (su carpeta de Pythons) y el destino: todo en el temporal.
  lanza "r$ronda" A
  lanza "r$ronda" B
  wait
  d=$(dir_de "r$ronda")
  ra=$(cut -d' ' -f1 "$TMPREAL/res.r$ronda.A"); ta=$(cut -d' ' -f2 "$TMPREAL/res.r$ronda.A")
  rb=$(cut -d' ' -f1 "$TMPREAL/res.r$ronda.B"); tb=$(cut -d' ' -f2 "$TMPREAL/res.r$ronda.B")
  vers=$(graphify_exec "$d/bin/graphify" --version 2>&1)
  lock=$([ -e "$d.lock" ] && echo "SIN liberar" || echo liberado)
  printf 'ronda %s: A rc=%s %ss | B rc=%s %ss | %s | lock %s\n' "$ronda" "$ra" "$ta" "$rb" "$tb" "$vers" "$lock"
  # Exclusión: de las dos, una instala y la otra encuentra la instalación hecha dentro del lock.
  hechas=$(cat "$TMPREAL/salida.r$ronda.A" "$TMPREAL/salida.r$ronda.B" | grep -c 'graphify_install: instalada en')
  previas=$(cat "$TMPREAL/salida.r$ronda.A" "$TMPREAL/salida.r$ronda.B" | grep -c 'graphify_install: ya estaba instalada')
  printf '         instalaron: %s, la encontraron hecha: %s\n' "$hechas" "$previas"
  if [ "$ra" = 0 ] && [ "$rb" = 0 ] && [ "$vers" = "graphify $VER" ] && [ "$lock" = liberado ] \
     && [ "$hechas" = 1 ] && [ "$previas" = 1 ]; then
    ok "ronda $ronda: las dos terminan con rc 0, una instala y la otra la encuentra hecha, el binario da graphify $VER y el lock se libera"
  else
    ko "ronda $ronda" "A rc=$ra, B rc=$rb, versión=$vers, lock $lock, instalaron=$hechas, encontraron=$previas; salidas: $(tail -n 2 "$TMPREAL/salida.r$ronda.A" "$TMPREAL/salida.r$ronda.B" | tr '\n' ' ')"
  fi
done

# Un lock viejo: su dueño (PID) ya no existe.
d=$(dir_de viejo)
mkdir -p "$d.lock"
sh -c 'echo $$' > "$d.lock/pid"   # un PID que ya no existe
t0=$(date +%s)
XDG_DATA_HOME="$TMPREAL/viejo" sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$VER" > "$TMPREAL/salida.viejo" 2>&1
rc=$?
dt=$(( $(date +%s) - t0 ))
if [ "$rc" = 0 ] && graphify_version_ok "$d/bin/graphify" "$VER" && [ ! -e "$d.lock" ]; then
  ok "lock viejo (dueño muerto): se recupera, instala (rc 0, ${dt} s) y libera el lock"
else
  ko "lock viejo" "rc=$rc salida: $(tail -n 2 "$TMPREAL/salida.viejo" | tr '\n' ' ')"
fi

# Un lock vivo que nunca se libera: la espera tiene tope.
d=$(dir_de vivo)
mkdir -p "$d.lock"
echo $$ > "$d.lock/pid"
t0=$(date +%s)
out=$(GRAPHIFY_LOCK_WAIT=3 XDG_DATA_HOME="$TMPREAL/vivo" sh -c '. "$1"; graphify_install "$2" "$XDG_DATA_HOME/club-colina-graphify/$2"' sh "$LIB" "$VER" 2>&1)
rc=$?
dt=$(( $(date +%s) - t0 ))
if [ "$rc" = 1 ] && [ "$dt" -ge 3 ] && [ "$dt" -le 10 ] && [ ! -e "$d/bin" ] && [ -d "$d.lock" ] && printf '%s' "$out" | grep -q 'sin lock'; then
  ok "lock vivo: la espera termina a los ${dt} s con rc 1, sin instalar y sin tocar el lock ajeno"
else
  ko "lock vivo" "rc=$rc tras ${dt} s; salida: $(printf '%s' "$out" | tr '\n' ' ')"
fi

# La instalación real no se tocó.
REAL_DESPUES=$(real_state)
if [ "$REAL_ANTES" = "$REAL_DESPUES" ]; then
  ok "la instalación real no cambió (carpeta y binario idénticos)"
else
  ko "instalación real" "cambió: antes=[$REAL_ANTES] después=[$REAL_DESPUES]"
fi

echo
echo "== $PASS PASS, $FAIL FAIL"
[ "$FAIL" -eq 0 ]
