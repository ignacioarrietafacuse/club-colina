#!/bin/sh
# Batería de los hooks de git de graphify (.githooks/), de scripts/setup-dev.sh, de
# scripts/graphify y de los hooks de Claude Code (.claude/hooks/graphify-*.sh).
# POSIX sh. Trabaja solo en un clon desechable del repo local, dentro de un mktemp -d, y
# aborta si el directorio de trabajo, o la raíz que ve git, no están bajo ese temporal: nunca
# toca este checkout ni ningún otro repo. Prueba lo que está comiteado en la rama actual (el
# clon parte de HEAD); los cambios sin comitear de scripts/ y .githooks/ no entran y se avisa.
#
# Seguridad (ver «Revisión 2026-10-06» del ADR):
# - Si hay variables de git exportadas (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE…) aborta: con
#   ellas, cada `git` de la batería actuaría sobre otro repo. Aborta antes de crear nada.
# - NUNCA instala: si el binario aislado no existe o su --version no es exactamente la de
#   .graphify-version, aborta y manda a correr scripts/setup-dev.sh. Además GRAPHIFY_NO_INSTALL=1
#   hace que graphify_install se niegue, así que ni un setup-dev dentro de la batería puede
#   llegar a `uv venv --clear`.
# - HOME, XDG_CACHE_HOME y XDG_CONFIG_HOME apuntan al temporal. XDG_DATA_HOME sigue apuntando
#   a la instalación real (solo se lee, para no reinstalar graphify).
#
# Un rebuild se detecta con el log del repo (graphify_log de la lib): cada uno escribe
# «=== <fecha> bin=… cwd=…» al empezar y «=== fin rc=N cwd=…» al terminar; se compara contra un
# marcador tomado antes de la operación. Como hay un log por repo, los contadores suman todos
# los de la carpeta de logs del temporal. Sale con código distinto de 0 si algún caso falló.

# ---- Lo único propio de cada repo: estas tres líneas ---------------------------------
# Rutas relativas a la raíz, sin espacios. CODE_DIR: carpeta de código que graphify indexa (no
# ignorada en .graphifyignore), donde la batería crea sus _t_*.py. IGNORED_DIR: ruta ignorada
# en .graphifyignore, adonde se renombra un archivo de código. MANIFEST: un package.json (está
# en .graphifyignore), que se comitea para comprobar que no reconstruye.
CODE_DIR=backend/src
IGNORED_DIR=docs
MANIFEST=backend/package.json
SRC=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd -P) || exit 1
[ -f "$SRC/.graphify-version" ] || { echo "Error: corre esto desde un clon de Club Colina." >&2; exit 1; }

# La batería prueba el comportamiento real: nada del entorno debe saltarse los hooks ni
# redirigir git. Se quitan todas y, si alguna de las de git estaba exportada, se aborta.
_gitvars=""
for _v in GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
          GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_PREFIX GIT_CEILING_DIRECTORIES; do
  eval "[ -z \"\${$_v+x}\" ]" || _gitvars="$_gitvars $_v"
done
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_PREFIX GIT_CEILING_DIRECTORIES
# GRAPHIFY_BIN y GRAPHIFY_ALLOW_TEST_BIN se quitan aquí y se fijan solo dentro de este script,
# caso por caso (las dos están en `deny` de .claude/settings.json: nadie las pasa desde fuera).
unset CLAUDE_CODE_REMOTE GRAPHIFY_SKIP_HOOK GRAPHIFY_BIN GRAPHIFY_ALLOW_TEST_BIN GRAPHIFY_OUT
if [ -n "$_gitvars" ]; then
  echo "ABORTO: hay variables de git exportadas:$_gitvars. Con ellas cada git de la batería actuaría sobre otro repo. Corre la batería con un entorno limpio." >&2
  exit 2
fi

# La batería nunca instala: el binario aislado tiene que estar ya, con la versión exacta.
# shellcheck source=../.githooks/lib-graphify.sh
. "$SRC/.githooks/lib-graphify.sh"
VER=$(graphify_version "$SRC") || { echo "ABORTO: .graphify-version debe contener solo X.Y.Z." >&2; exit 2; }
REAL_DATA=${XDG_DATA_HOME:-$HOME/.local/share}
REALBIN="$REAL_DATA/club-colina-graphify/$VER/bin/graphify"
if ! graphify_version_ok "$REALBIN" "$VER"; then
  echo "ABORTO: no hay graphify $VER instalado (o su --version no es exactamente «graphify ${VER}»). La batería nunca instala: corre scripts/setup-dev.sh y vuelve a correrla." >&2
  exit 2
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/graphify-hooks.XXXXXX") || exit 1
TMPREAL=$(cd "$TMP" && pwd -P) || exit 1
case "$TMPREAL" in /?*) ;; *) echo "Error: temporal inválido: $TMPREAL" >&2; exit 1 ;; esac
case "$SRC/" in "$TMPREAL"/*) echo "Error: el repo está dentro del temporal." >&2; exit 1 ;; esac

export XDG_DATA_HOME="$REAL_DATA"
mkdir -p "$TMPREAL/home" "$TMPREAL/cache" "$TMPREAL/config"
export HOME="$TMPREAL/home"
export XDG_CACHE_HOME="$TMPREAL/cache" XDG_CONFIG_HOME="$TMPREAL/config"
export GRAPHIFY_NO_INSTALL=1
export GIT_AUTHOR_NAME=Prueba GIT_AUTHOR_EMAIL=prueba@example.invalid
export GIT_COMMITTER_NAME=Prueba GIT_COMMITTER_EMAIL=prueba@example.invalid
export GIT_EDITOR=true GIT_MERGE_AUTOEDIT=no GIT_TERMINAL_PROMPT=0
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

LOGDIR="$XDG_CACHE_HOME/club-colina-graphify"
CLONE="$TMPREAL/clone"
SECOND="$TMPREAL/segundo"
THIRD="$TMPREAL/tercero"
OTRO=""
PASS=0
FAIL=0
SKIP=0

ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
ko() { FAIL=$((FAIL + 1)); printf 'FAIL  %s  -> %s\n' "$1" "$2"; }
# Un caso que no se puede reproducir en este entorno: no suma PASS ni FAIL.
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }
flat() { printf '%s' "$1" | tr '\n' ' ' | cut -c1-300; }
# Un zombi (Z) cuenta como muerto: kill -0 responde bien mientras espera a que su padre (o el init)
# lo recoja, y en Linux eso puede tardar 1-2 s. Sin estado en ps, ya terminó.
vivo() {
  [ -n "$1" ] && kill -0 "$1" 2>/dev/null || return 1
  case "$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' ')" in ''|Z*) return 1 ;; esac
}

alllogs() { cat "$LOGDIR"/*.log 2>/dev/null; }
starts() { alllogs | grep -c ' bin=' || true; }
fins() { alllogs | grep -c '^=== fin' || true; }
fallidos() { alllogs | grep -c '^=== fin rc=[1-9]' || true; }

cleanup() {
  _rc=$?
  cd / 2>/dev/null
  # Antes de borrar, deja terminar un rebuild que siga escribiendo en el temporal.
  _i=0
  while [ "$_i" -lt 60 ] && [ "$(starts)" != "$(fins)" ]; do sleep 1; _i=$((_i + 1)); done
  case "$TMPREAL" in
    /?*) [ -d "$TMPREAL" ] && rm -rf "$TMPREAL" && echo "Temporal borrado: $TMPREAL" ;;
  esac
  case "$OTRO" in
    "${TMPDIR:-/tmp}"/graphify-gitdir.*) rm -rf "$OTRO" ;;
  esac
  return "$_rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

abort() { echo "ABORTO: $*" >&2; exit 2; }

# Aborta si el directorio de trabajo, o la raíz del repo que ve git, no están bajo el temporal.
guard() {
  case "$(pwd -P)/" in
    "$TMPREAL"/?*) ;;
    *) abort "el directorio de trabajo ($(pwd -P)) no está bajo $TMPREAL" ;;
  esac
  _top=$(git rev-parse --show-toplevel 2>/dev/null)
  case "$_top/" in
    "$TMPREAL"/?*) ;;
    *) abort "la raíz del repo que ve git ($_top) no está bajo $TMPREAL" ;;
  esac
}

# Espera a que no haya rebuilds en curso (todo «bin=» tiene su «=== fin»). El hook lanza el
# rebuild con nohup y su línea de inicio llega al log unos milisegundos después de que git
# vuelve: se exigen dos lecturas iguales con 1 s de por medio para no darlo por terminado antes.
settle() {
  _i=0
  while [ "$_i" -lt "${1:-180}" ]; do
    if [ "$(starts)" = "$(fins)" ]; then
      sleep 1
      [ "$(starts)" = "$(fins)" ] && return 0
    fi
    sleep 1
    _i=$((_i + 1))
  done
  return 1
}

snap() {
  settle || echo "  (aviso: un rebuild anterior no terminó)"
  S_START=$(starts); S_FIN=$(fins); S_FAIL=$(fallidos)
}

# El hook sí reconstruyó: aparece un «=== fin» nuevo en el log, con rc=0.
expect_rebuild() {
  _i=0
  while [ "$_i" -lt 180 ]; do
    [ "$(fins)" -gt "$S_FIN" ] && break
    sleep 1
    _i=$((_i + 1))
  done
  if [ "$(fins)" -le "$S_FIN" ]; then ko "$1" "no hubo rebuild en 180 s${2:+; salida de git: $(flat "$2")}"; return 1; fi
  settle >/dev/null
  if [ "$(fallidos)" -gt "$S_FAIL" ]; then ko "$1" "el rebuild terminó con error"; return 1; fi
  ok "$1"
}

# El hook no reconstruyó: ni empezó uno (marcador de inicio) ni terminó otro.
expect_no_rebuild() {
  sleep 3
  if [ "$(starts)" != "$S_START" ] || [ "$(fins)" != "$S_FIN" ]; then ko "$1" "se lanzó un rebuild"; return 1; fi
  ok "$1"
}

# Exactamente <n> rebuilds desde el último snap (se llama después de expect_rebuild + settle).
expect_count() { # descripción n
  _got=$(( $(starts) - S_START ))
  if [ "$_got" = "$2" ]; then ok "$1"; else ko "$1" "rebuilds lanzados: $_got (esperaba $2)"; fi
}

occurrences() { grep -o "$1" "$CLONE/graphify-out/graph.json" 2>/dev/null | wc -l | tr -d ' '; }

commit_file() { # ruta contenido mensaje
  mkdir -p "$(dirname "$1")" && printf '%s\n' "$2" > "$1" && git add -- "$1" && git commit -q -m "$3"
}

perm() { # ruta -> permisos octales
  if [ "$(uname)" = Darwin ]; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

json_valido() { # stdin
  if command -v jq >/dev/null 2>&1; then jq -e . >/dev/null 2>&1; else python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null; fi
}

echo "== graphify: batería de hooks"
echo "repo:      $SRC"
echo "temporal:  $TMPREAL"
echo "instalación: $REAL_DATA/club-colina-graphify/$VER ($(graphify_exec "$REALBIN" --version))"
echo "carpeta de logs: $LOGDIR"
if [ -n "$(git -C "$SRC" status --porcelain -- .githooks scripts .graphify-version .graphifyignore .claude/hooks 2>/dev/null)" ]; then
  echo "AVISO: hay cambios sin comitear en los archivos de graphify; la batería prueba lo comiteado."
fi

git clone -q "$SRC" "$CLONE" || { echo "Error: no se pudo clonar" >&2; exit 1; }
cd "$CLONE" || exit 1
guard
git switch -q -c prueba
CLONELOG=$(graphify_log "$CLONE")

# ---- setup-dev ------------------------------------------------------------------------
guard
if out1=$(scripts/setup-dev.sh 2>&1); then
  if [ "$(git config --get core.hooksPath)" = ".githooks" ] && [ -f graphify-out/graph.json ]; then
    ok "setup-dev (1.ª vez): grafo generado y core.hooksPath=.githooks"
  else
    ko "setup-dev (1.ª vez)" "sin grafo o sin core.hooksPath"
  fi
else
  ko "setup-dev (1.ª vez)" "salió con error: $(printf '%s' "$out1" | tail -n 3 | tr '\n' ' ')"
fi
if out2=$(scripts/setup-dev.sh 2>&1); then
  if printf '%s' "$out2" | grep -q 'ya instalado' && ! printf '%s' "$out2" | grep -q 'instalando en'; then
    ok "setup-dev (2.ª vez): no reinstala"
  else
    ko "setup-dev (2.ª vez)" "reinstaló o no dijo «ya instalado»"
  fi
else
  ko "setup-dev (2.ª vez)" "salió con error"
fi
guard
[ -f graphify-out/graph.json ] || { echo "ABORTO: sin grafo, no se puede seguir" >&2; exit 1; }

# ---- commits --------------------------------------------------------------------------
guard; snap
commit_file $CODE_DIR/_t_commit.py 'def t_commit_fn(): return 1' "prueba: código"
expect_rebuild "commit de código: reconstruye"

guard; snap
commit_file $CODE_DIR/_t_nota.md '# nota' "prueba: solo md"
expect_no_rebuild "commit de solo .md: no reconstruye"

guard; snap
commit_file .github/_t_config.yml 'a: 1' "prueba: solo config"
expect_no_rebuild "commit de solo config: no reconstruye"

# ---- merge ----------------------------------------------------------------------------
guard; snap
git switch -q -c ramam
commit_file $CODE_DIR/_t_merge.py 'def t_merge_fn(): return 1' "prueba: rama merge"
settle; snap
git switch -q prueba
expect_rebuild "cambio de rama (git switch) con un .py distinto: reconstruye"
settle; snap
if git merge --no-ff -q -m "prueba: merge" ramam >/dev/null 2>&1; then
  expect_rebuild "merge (--no-ff): reconstruye"
else
  ko "merge (--no-ff)" "git merge falló"
fi

# ---- merge --squash -------------------------------------------------------------------
guard; settle
git switch -q -c ramas
commit_file $CODE_DIR/_t_squash.py 'def t_squash_fn(): return 1' "prueba: rama squash"
settle
git switch -q prueba
settle; snap
if git merge --squash -q ramas >/dev/null 2>&1; then
  expect_rebuild "merge --squash: reconstruye (sin commit aún)"
else
  ko "merge --squash" "git merge --squash falló"
fi
settle
git commit -q -m "prueba: squash" >/dev/null 2>&1
settle

# ---- rebase ---------------------------------------------------------------------------
guard
git switch -q -c ramar
commit_file $CODE_DIR/_t_rebase.py 'def t_rebase_fn(): return 1' "prueba: rama rebase"
settle
git switch -q prueba
commit_file $CODE_DIR/_t_base2.py 'def t_base2_fn(): return 1' "prueba: base nueva"
settle
git switch -q ramar
settle; snap
if out=$(git rebase -q prueba 2>&1); then
  expect_rebuild "rebase: reconstruye" "$out"
  settle
  expect_count "rebase normal: reconstruye una sola vez" 1
else
  ko "rebase" "git rebase falló: $(flat "$out")"
  git rebase --abort >/dev/null 2>&1
fi
settle
git switch -q prueba
settle

# ---- rebase de avance rápido ----------------------------------------------------------
# La rama no tiene commits propios: git mueve HEAD a la base nueva y no reaplica nada, así que
# post-rewrite no corre. Solo el post-checkout de ese movimiento ve el cambio.
guard; settle
git switch -q -c ramaff
settle
git switch -q prueba
commit_file $CODE_DIR/_t_ff.py 'def t_ff_unico_fn(): return 1' "prueba: avance para el rebase rápido"
settle
git switch -q ramaff
settle; snap
if out=$(git rebase -q prueba 2>&1); then
  expect_rebuild "rebase de avance rápido (git rebase): reconstruye" "$out"
  settle
  expect_count "rebase de avance rápido: reconstruye una sola vez" 1
  if [ "$(occurrences t_ff_unico_fn)" -gt 0 ]; then
    ok "rebase de avance rápido: el grafo ya trae el código nuevo"
  else
    ko "rebase de avance rápido: el grafo trae el código nuevo" "no aparece t_ff_unico_fn"
  fi
else
  ko "rebase de avance rápido" "git rebase falló: $(flat "$out")"
  git rebase --abort >/dev/null 2>&1
fi
settle
git switch -q prueba
settle

# ---- pull --rebase de avance rápido (contra un tercer clon) ---------------------------
# Es un caso de REGRESIÓN, no prueba el arreglo de post-checkout: este camino no deja estado de
# rebase en el checkout y ya reconstruía antes del arreglo (la prueba de mutación lo confirmó).
# El que detecta el arreglo del rebase rápido es el de `git rebase` de arriba.
guard; settle
git clone -q "$CLONE" "$THIRD" || ko "pull --rebase" "no se pudo crear el tercer clon"
if [ -d "$THIRD" ]; then
  git -C "$THIRD" switch -q prueba
  mkdir -p "$THIRD/$CODE_DIR" && echo 'def t_pullrb_unico_fn(): return 1' > "$THIRD/$CODE_DIR/_t_pullrb.py"
  git -C "$THIRD" add -- $CODE_DIR/_t_pullrb.py && git -C "$THIRD" commit -q -m "tercero: código"
  git remote add tercero "$THIRD"
  git switch -q -c ramapr
  settle; snap
  if out=$(git pull -q --rebase tercero prueba 2>&1); then
    expect_rebuild "pull --rebase de avance rápido (regresión, ya reconstruía): reconstruye" "$out"
    settle
    if [ "$(occurrences t_pullrb_unico_fn)" -gt 0 ]; then
      ok "pull --rebase de avance rápido (regresión): el grafo ya trae el código nuevo"
    else
      ko "pull --rebase de avance rápido (regresión): el grafo trae el código nuevo" "no aparece t_pullrb_unico_fn"
    fi
  else
    ko "pull --rebase de avance rápido (regresión)" "git pull --rebase falló: $(flat "$out")"
    git rebase --abort >/dev/null 2>&1
  fi
  settle
  git switch -q prueba
  settle
fi

# ---- cherry-pick, uno y dos commits, y revert -----------------------------------------
guard; settle
git switch -q -c cpsrc1
commit_file $CODE_DIR/_t_cp1.py 'def t_cp1_unico_fn(): return 1' "prueba: cp1"
CP1=$(git rev-parse HEAD)
settle
git switch -q prueba
git switch -q -c cpsrc2
commit_file $CODE_DIR/_t_cp2.py 'def t_cp2_unico_fn(): return 1' "prueba: cp2"
CP2=$(git rev-parse HEAD)
commit_file $CODE_DIR/_t_cp3.py 'def t_cp3_unico_fn(): return 1' "prueba: cp3"
CP3=$(git rev-parse HEAD)
settle
git switch -q prueba
settle; snap
if out=$(git cherry-pick "$CP1" 2>&1); then
  expect_rebuild "cherry-pick de 1 commit: reconstruye" "$out"
  settle
  if [ "$(occurrences t_cp1_unico_fn)" -gt 0 ]; then ok "cherry-pick de 1 commit: el grafo trae el código"; else ko "cherry-pick de 1 commit: el grafo trae el código" "no aparece t_cp1_unico_fn"; fi
else
  ko "cherry-pick de 1 commit" "git cherry-pick falló: $(flat "$out")"
  git cherry-pick --abort >/dev/null 2>&1
fi
settle; snap
if out=$(git cherry-pick "$CP2" "$CP3" 2>&1); then
  expect_rebuild "cherry-pick de 2 commits: reconstruye" "$out"
  settle
  if [ "$(occurrences t_cp2_unico_fn)" -gt 0 ] && [ "$(occurrences t_cp3_unico_fn)" -gt 0 ]; then
    ok "cherry-pick de 2 commits: el grafo trae el código de los dos"
  else
    ko "cherry-pick de 2 commits: el grafo trae el código de los dos" "cp2=$(occurrences t_cp2_unico_fn) cp3=$(occurrences t_cp3_unico_fn)"
  fi
else
  ko "cherry-pick de 2 commits" "git cherry-pick falló: $(flat "$out")"
  git cherry-pick --abort >/dev/null 2>&1
fi
# Es un caso de REGRESIÓN: con git 2.50 un revert sin conflicto no deja REVERT_HEAD cuando corre
# post-commit, así que quitar esa excepción de graphify_precheck no lo hace fallar (la prueba de
# mutación lo confirmó). La excepción de REVERT_HEAD en la lib es defensiva.
settle; snap
if out=$(git revert --no-edit HEAD 2>&1); then
  expect_rebuild "revert (regresión): reconstruye" "$out"
  settle
  if [ "$(occurrences t_cp3_unico_fn)" = 0 ]; then ok "revert (regresión): el grafo ya no trae el código revertido"; else ko "revert (regresión): el grafo ya no trae el código revertido" "t_cp3_unico_fn sigue"; fi
else
  ko "revert (regresión)" "git revert falló: $(flat "$out")"
  git revert --abort >/dev/null 2>&1
fi
settle

# ---- post-checkout: cambio de rama sin código, checkout de archivo, package.json -------
guard; settle
git switch -q -c ramad
commit_file $CODE_DIR/_t_solo_md.md '# solo md en otra rama' "prueba: rama solo md"
settle; snap
git switch -q prueba
expect_no_rebuild "cambio de rama (git switch) con solo un .md distinto: no reconstruye"

guard; settle
commit_file $CODE_DIR/_t_chk.py 'def t_chk_fn(): return 1' "prueba: archivo para checkout, v1"
settle
commit_file $CODE_DIR/_t_chk.py 'def t_chk_fn(): return 2' "prueba: archivo para checkout, v2"
settle; snap
git checkout -q HEAD~1 -- $CODE_DIR/_t_chk.py
expect_no_rebuild "git checkout <commit> -- archivo.py (post-checkout con \$3=0): no reconstruye"
git checkout -q HEAD -- $CODE_DIR/_t_chk.py

guard; settle; snap
commit_file $MANIFEST '{"name":"prueba","version":"0.0.1"}' "prueba: solo $MANIFEST"
expect_no_rebuild "commit que solo toca $MANIFEST: no reconstruye"

# ---- pull (contra un segundo clon) ----------------------------------------------------
guard
git clone -q "$CLONE" "$SECOND" || ko "pull" "no se pudo crear el segundo clon"
if [ -d "$SECOND" ]; then
  git -C "$SECOND" switch -q prueba
  mkdir -p "$SECOND/$CODE_DIR" && echo 'def t_pull_fn(): return 1' > "$SECOND/$CODE_DIR/_t_pull.py"
  git -C "$SECOND" add -- $CODE_DIR/_t_pull.py && git -C "$SECOND" commit -q -m "segundo: código"
  git remote add segundo "$SECOND"
  snap
  if git pull -q --no-rebase segundo prueba >/dev/null 2>&1; then
    expect_rebuild "pull (avance rápido con código): reconstruye"
  else
    ko "pull" "git pull falló"
  fi
  settle
  echo '# otro' > "$SECOND/$CODE_DIR/_t_pull.md"
  git -C "$SECOND" add -- $CODE_DIR/_t_pull.md && git -C "$SECOND" commit -q -m "segundo: md"
  snap
  if git pull -q --no-rebase segundo prueba >/dev/null 2>&1; then
    expect_no_rebuild "pull (solo .md): no reconstruye"
  else
    ko "pull (solo .md)" "git pull falló"
  fi
fi

# ---- git am ---------------------------------------------------------------------------
guard; settle
(
  cd "$SECOND" && guard &&
  mkdir -p $CODE_DIR && echo 'def t_am_fn(): return 1' > $CODE_DIR/_t_am.py &&
  git add -- $CODE_DIR/_t_am.py && git commit -q -m "segundo: parche" &&
  git format-patch -1 --stdout > "$TMPREAL/parche.patch"
) || ko "git am" "no se pudo armar el parche"
snap
if git am -q "$TMPREAL/parche.patch" >/dev/null 2>&1; then
  expect_rebuild "git am: reconstruye"
else
  ko "git am" "git am falló"
  git am --abort >/dev/null 2>&1
fi
settle

# ---- amend ----------------------------------------------------------------------------
guard; snap
commit_file $CODE_DIR/_t_amend.py 'def t_amend_unico_fn(): return 1' "prueba: amend"
expect_rebuild "amend: el commit original reconstruye"
settle
antes=$(occurrences t_amend_unico_fn)
snap
echo 'def t_amend_unico_fn(): return 2' > $CODE_DIR/_t_amend.py
git add -- $CODE_DIR/_t_amend.py && git commit -q --amend -m "prueba: amend (enmendado)"
expect_rebuild "amend: reconstruye una vez"
settle
despues=$(occurrences t_amend_unico_fn)
if [ "$antes" -gt 0 ] && [ "$antes" = "$despues" ] && [ "$(starts)" = "$((S_START + 1))" ]; then
  ok "amend: no duplica (apariciones antes=$antes, después=$despues; un solo rebuild)"
else
  ko "amend: no duplica" "antes=$antes después=$despues rebuilds=$(( $(starts) - S_START ))"
fi

# ---- clon nuevo (sha nulo) ------------------------------------------------------------
guard; settle
NUEVO="$TMPREAL/nuevo"
NULO=0000000000000000000000000000000000000000
snap
out=$(git clone -q -c core.hooksPath=.githooks "$CLONE" "$NUEVO" 2>&1)
rc=$?
if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q 'sin grafo local'; then
  sleep 2
  if [ "$(starts)" = "$S_START" ]; then
    ok "clon nuevo sin grafo: el checkout no falla, avisa y no reconstruye"
  else
    ko "clon nuevo sin grafo" "lanzó un rebuild"
  fi
else
  ko "clon nuevo sin grafo" "rc=$rc salida: $(printf '%s' "$out" | tr '\n' ' ')"
fi
if [ -d "$NUEVO" ]; then
  cd "$NUEVO" && guard
  # Un clon no trae graphify-out/ (no está versionado): se copia el grafo y se invoca el hook
  # como lo hace git al terminar el clon (sha anterior nulo).
  cp -R "$CLONE/graphify-out" "$NUEVO/graphify-out"
  snap
  sh .githooks/post-checkout "$NULO" "$(git rev-parse HEAD)" 1 >/dev/null 2>&1
  expect_rebuild "clon nuevo (sha nulo, con grafo): reconstruye"
  settle
  cd "$CLONE" && guard
fi

# ---- nombres de archivo ---------------------------------------------------------------
guard; snap
commit_file "$CODE_DIR/módulo_ñandú.py" 'def t_tilde_fn(): return 1' "prueba: tilde"
expect_rebuild "archivo con tilde: reconstruye"
settle
guard; snap
commit_file "$CODE_DIR/con espacio.py" 'def t_espacio_fn(): return 1' "prueba: espacio"
expect_rebuild "archivo con espacio: reconstruye"
settle

# ---- renombre de código a una ruta ignorada -------------------------------------------
guard; snap
commit_file $CODE_DIR/_t_renombre.py 'def t_renombre_unico_fn(): return 1' "prueba: antes del renombre"
expect_rebuild "renombre: el archivo de partida se indexa"
settle
antes=$(occurrences t_renombre_unico_fn)
snap
git mv $CODE_DIR/_t_renombre.py $IGNORED_DIR/_t_renombre.py 2>/dev/null || {
  mkdir -p $IGNORED_DIR && git mv $CODE_DIR/_t_renombre.py $IGNORED_DIR/_t_renombre.py
}
git commit -q -m "prueba: renombre a ruta ignorada"
expect_rebuild "renombre de código a una ruta ignorada: reconstruye"
settle
despues=$(occurrences t_renombre_unico_fn)
if [ "$antes" -gt 0 ] && [ "$despues" = 0 ]; then
  ok "renombre: el nodo del archivo que salió del índice desaparece (antes=$antes, después=$despues)"
else
  ko "renombre: el nodo desaparece" "antes=$antes después=$despues"
fi

# ---- operación en curso ---------------------------------------------------------------
guard; settle
commit_file $CODE_DIR/_t_conflicto.py 'linea=base' "prueba: base del conflicto"
settle
git switch -q -c c1
commit_file $CODE_DIR/_t_conflicto.py 'linea=uno' "prueba: c1"
settle
git switch -q prueba
git switch -q -c c2
commit_file $CODE_DIR/_t_conflicto.py 'linea=dos' "prueba: c2"
settle
snap
if git rebase c1 >/dev/null 2>&1; then
  ko "operación en curso" "el rebase no se detuvo por conflicto"
else
  if [ -d "$(git rev-parse --git-dir)/rebase-merge" ] || [ -d "$(git rev-parse --git-dir)/rebase-apply" ]; then
    # Con el rebase detenido, un commit de código pasa por post-commit: debe saltar.
    echo 'linea=resuelta' > $CODE_DIR/_t_conflicto.py
    git add -- $CODE_DIR/_t_conflicto.py
    git commit -q -m "prueba: commit con el rebase detenido" >/dev/null 2>&1
    expect_no_rebuild "operación en curso (rebase detenido): el hook salta"
  else
    ko "operación en curso" "no quedó un rebase detenido"
  fi
fi
git rebase --abort >/dev/null 2>&1
settle
git switch -q prueba >/dev/null 2>&1

# ---- lib ilegible ---------------------------------------------------------------------
# La lib existe pero no se puede leer: ningún hook puede fallar el comando de git.
# El caso que detecta el arreglo es el de `git switch` (post-checkout, cuyo rc sí llega a git).
# El de `git commit` es solo de regresión: git no falla un commit porque post-commit salga mal,
# así que no puede detectar la mutación (la prueba de mutación lo confirmó).
guard; settle
git switch -q -c ramal
commit_file $CODE_DIR/_t_ilegible.py 'def t_ilegible_fn(): return 1' "prueba: rama lib ilegible"
settle
git switch -q prueba
settle
# Como root (la nube de Claude Code), chmod 000 no impide leer: el caso no se puede reproducir
# y queda como un solo SKIP, que no suma PASS ni FAIL.
if [ "$(id -u)" = 0 ]; then
  skip "lib ilegible: se corre como root (chmod 000 no aplica)"
else
  snap
  git update-index --assume-unchanged .githooks/lib-graphify.sh
  chmod 000 .githooks/lib-graphify.sh
  out=$(git switch ramal 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then ok "lib ilegible: git switch sale con 0"; else ko "lib ilegible: git switch" "rc=$rc salida: $(flat "$out")"; fi
  commit_file $CODE_DIR/_t_ilegible2.py 'def t_ilegible2_fn(): return 1' "prueba: commit con la lib ilegible" >/dev/null 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then ok "lib ilegible: git commit sale con 0 (regresión; git ignora el rc de post-commit)"; else ko "lib ilegible: git commit (regresión)" "rc=$rc"; fi
  chmod 644 .githooks/lib-graphify.sh
  git update-index --no-assume-unchanged .githooks/lib-graphify.sh
  expect_no_rebuild "lib ilegible: no se lanza ningún rebuild"
  git switch -q prueba >/dev/null 2>&1
  settle
fi

# ---- ninguna carpeta de respaldo ------------------------------------------------------
guard; settle
respaldos=$(find "$CLONE/graphify-out" "$NUEVO/graphify-out" -mindepth 1 -maxdepth 1 -type d \
  -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' 2>/dev/null)
if [ -z "$respaldos" ]; then
  ok "ninguna carpeta graphify-out/<fecha>/"
else
  ko "carpetas graphify-out/<fecha>/" "$respaldos"
fi

# ---- log por repo, permisos y cwd -----------------------------------------------------
guard; settle
if [ -f "$CLONELOG" ] && [ "$(perm "$CLONELOG")" = 600 ] && [ "$(perm "$(dirname "$CLONELOG")")" = 700 ]; then
  ok "log: archivo 600 y carpeta 700 ($(perm "$CLONELOG") / $(perm "$(dirname "$CLONELOG")"))"
else
  ko "log: permisos" "archivo=$(perm "$CLONELOG" 2>&1) carpeta=$(perm "$(dirname "$CLONELOG")" 2>&1)"
fi
NUEVOLOG=$(graphify_log "$NUEVO")
if [ "$CLONELOG" != "$NUEVOLOG" ] && [ -f "$NUEVOLOG" ] && grep -q "cwd=$NUEVO" "$NUEVOLOG" && ! grep -q "cwd=$NUEVO" "$CLONELOG"; then
  ok "log: un log por repo (el del clon nuevo es otro archivo y no mezcla)"
else
  ko "log: un log por repo" "clon=$CLONELOG nuevo=$NUEVOLOG"
fi
sinCwd=$(alllogs | grep '^=== ' | grep -vc 'cwd=')
if [ "$sinCwd" = 0 ]; then ok "log: cada línea === de inicio y de fin lleva el cwd"; else ko "log: cwd en las líneas ===" "$sinCwd líneas sin cwd"; fi
if [ "$(basename "$CLONELOG")" = "clone-$(printf '%s' "$CLONE" | graphify_sha8).log" ]; then
  ok "log: el nombre es <repo>-<8 hex del sha256 de la ruta>.log"
else
  ko "log: nombre" "$(basename "$CLONELOG")"
fi

# ---- recorte del log (en otra carpeta de caché, para no alterar los contadores) --------
guard; settle
(
  export XDG_CACHE_HOME="$TMPREAL/cache2"
  L=$(graphify_log "$CLONE")
  graphify_log_init "$L"
  i=0; while [ "$i" -lt 4500 ]; do echo "relleno $i"; i=$((i + 1)); done >> "$L"
  commit_file $CODE_DIR/_t_recorte.py 'def t_recorte_fn(): return 1' "prueba: recorte del log" >/dev/null 2>&1
  j=0; while [ "$j" -lt 120 ] && ! grep -q '^=== fin' "$L"; do sleep 1; j=$((j + 1)); done
  sleep 1
  n=$(wc -l < "$L" | tr -d ' ')
  [ "$n" -le 2040 ] && [ "$n" -ge 1990 ] && [ "$(perm "$L")" = 600 ] && grep -q '^=== fin rc=0' "$L"
) && ok "log: al pasar de 4000 líneas se deja en ~2000 y sigue 600" || ko "log: recorte" "no quedó en ~2000 líneas con permisos 600"
settle

# ---- scripts/graphify: lista blanca con argv real, entorno y filtro --------------------
guard; settle
FAKES="$TMPREAL/fakes"; mkdir -p "$FAKES"
FAKECALLS="$FAKES/calls"
cat > "$FAKES/argv" <<EOF
#!/bin/sh
echo called >> "$FAKECALLS"
for a in "\$@"; do printf '%s\n' "\$a"; done
EOF
cat > "$FAKES/env" <<'EOF'
#!/bin/sh
env | cut -d= -f1 | sort
echo "claude=$(command -v claude || echo no)"
EOF
# Sugerencias en stdout y stderr. rc3 sale con 3; sug0 con 0 (y responde --version, porque
# setup-dev lo llama al final sin filtro).
sugerencias() { # rc
  cat <<EOF
#!/bin/sh
[ "\$1" = --version ] && { echo "graphify 0.0.0"; exit 0; }
echo "resultado normal: scripts/graphify path A B"
echo "Siguiente paso: ejecuta /graphify para etiquetar"
echo "corre graphify cluster-only . para reagrupar"
echo "usa graphify label para nombrar"
echo "o vuelve con --update"
echo "aviso en stderr: prueba /graphify aquí" >&2
echo "aviso normal en stderr" >&2
exit $1
EOF
}
sugerencias 3 > "$FAKES/rc3"
sugerencias 0 > "$FAKES/sug0"
cat > "$FAKES/hookenv" <<EOF
#!/bin/sh
{ env | cut -d= -f1 | sort; echo "claude=\$(command -v claude || echo no)"; } > "$FAKES/hook.env"
EOF
# H6: una ruta con «=» (env la tomaría por una asignación).
mkdir -p "$FAKES/a=b"
cp "$FAKES/argv" "$FAKES/a=b/argv"
# H7: escribe su PID y se queda corriendo (exec: el PID es el del proceso que queda vivo).
cat > "$FAKES/lento" <<EOF
#!/bin/sh
echo \$\$ > "$FAKES/lento.pid"
exec sleep 60
EOF
# H8: el stderr de un error real que menciona /graphify, con rc 1.
cat > "$FAKES/err1" <<'EOF'
#!/bin/sh
echo "Siguiente paso: ejecuta /graphify"
echo "error: path not found: /graphify" >&2
exit 1
EOF
# H8: bytes que no son UTF-8 antes, dentro y después de una línea que se filtra.
cat > "$FAKES/bytes" <<'EOF'
#!/bin/sh
printf 'antes \377\376 binario\n'
printf 'sugerencia \377 ejecuta /graphify\n'
printf 'despues \351 fin\n'
EOF
chmod +x "$FAKES/argv" "$FAKES/env" "$FAKES/rc3" "$FAKES/sug0" "$FAKES/hookenv" "$FAKES/a=b/argv" \
  "$FAKES/lento" "$FAKES/err1" "$FAKES/bytes"
ALLOWED="PATH HOME USER LOGNAME LANG LC_ALL TERM TMPDIR GRAPHIFY_NO_AUTO_REFRESH GRAPHIFY_QUERY_LOG_DISABLE GRAPHIFY_NO_TIPS GRAPHIFY_NO_BACKUP PYTHONHASHSEED PWD SHLVL _ OLDPWD"

# scripts/graphify con un binario de prueba: GRAPHIFY_BIN solo cuenta junto con
# GRAPHIFY_ALLOW_TEST_BIN=1, y las dos se fijan aquí, dentro de la batería.
conbin() { # <binario> <comando...>
  _cb=$1; shift
  GRAPHIFY_BIN="$_cb" GRAPHIFY_ALLOW_TEST_BIN=1 "$@"
}

rechaza() { # <texto que el mensaje debe nombrar> <argv...>
  _name=$1; shift
  rm -f "$FAKECALLS"
  _o=$(conbin "$FAKES/argv" scripts/graphify "$@" 2>&1 >/dev/null); _rc=$?
  if [ "$_rc" = 2 ] && printf '%s' "$_o" | grep -qF -- "$_name" && [ ! -f "$FAKECALLS" ]; then
    ok "lista blanca rechaza (rc 2, nombra «${_name}», no llega al binario): $*"
  else
    ko "lista blanca rechaza: $*" "rc=$_rc, ¿llegó al binario?=$([ -f "$FAKECALLS" ] && echo sí || echo no), mensaje: $(flat "$_o")"
  fi
}
rechaza --graph query "x" --graph /etc/passwd
rechaza --graph=/etc/passwd query "x" --graph=/etc/passwd
rechaza --update query "x" --update
rechaza --unknown query "x" --unknown
rechaza abc query "x" --budget abc
rechaza --budget query "x" --budget
rechaza --budget=abc query "x" --budget=abc
rechaza --context query "x" --context
rechaza otra query "x" otra
rechaza --dfs query --dfs
rechaza --graph path A B --graph /etc/passwd
rechaza ZZZ path A B ZZZ
rechaza --graph explain X --graph /etc/passwd
rechaza --dfs explain X --dfs
rechaza YYY explain X YYY
rechaza label label
rechaza cluster-only cluster-only .
rechaza hook-guard hook-guard search
rechaza --foo extract . --code-only --foo
rechaza extract extract .
rechaza --code-only update . --code-only
rechaza --version --version extra
# H1: un argumento terminado en «:.» ya no calza con el patrón de «.» (era `*:.` sobre "$_cmd:$_a").
rechaza '--out=/tmp/x:.' extract . --code-only '--out=/tmp/x:.'
rechaza '--postgres=p://h/d?a=x:.' extract . --code-only '--postgres=p://h/d?a=x:.'
rechaza '--exclude=f:.' extract . --code-only '--exclude=f:.'
rechaza '--backend=claude:.' extract . --code-only '--backend=claude:.'
rechaza 'x:.' update 'x:.'
rechaza '--out=/tmp/x:.' update '--out=/tmp/x:.'
# H2: exactamente un «.» en extract y update.
rechaza 'exactamente un «.»' update
rechaza 'exactamente un «.»' update --force
rechaza 'exactamente un «.»' extract --code-only
rechaza 'exactamente un «.»' extract . --code-only .
rechaza 'exactamente un «.»' update . .

acepta() { # <descripción> <salida esperada> <argv...>
  _d=$1; _w=$2; shift 2
  _g=$(conbin "$FAKES/argv" scripts/graphify "$@" 2>&1); _rc=$?
  if [ "$_rc" = 0 ] && [ "$_g" = "$_w" ]; then ok "lista blanca acepta $_d y pasa el argv intacto"; else ko "lista blanca acepta $_d" "rc=$_rc salida: $(flat "$_g")"; fi
}
acepta "query con --dfs --budget --context" "query
dónde se crea el token
--dfs
--budget
500
--context
auth" query "dónde se crea el token" --dfs --budget 500 --context auth
acepta "path con --directed" "path
A b
C
--directed" path "A b" "C" --directed
acepta "explain con una etiqueta" "explain
Una etiqueta" explain "Una etiqueta"
acepta "update ." "update
." update .
acepta "update . --force --no-cluster" "update
.
--force
--no-cluster" update . --force --no-cluster
acepta "extract . --code-only" "extract
.
--code-only" extract . --code-only
acepta "extract --code-only . --no-cluster" "extract
--code-only
.
--no-cluster" extract --code-only . --no-cluster

# H6: un binario cuya ruta tiene «=» se ejecuta (antes env lo tomaba por una asignación).
got=$(conbin "$FAKES/a=b/argv" scripts/graphify explain "X" 2>&1); rc=$?
if [ "$rc" = 0 ] && [ "$got" = "explain
X" ]; then ok "binario con «a=b» en la ruta: se ejecuta y recibe el argv intacto"; else ko "binario con «a=b» en la ruta" "rc=$rc salida: $(flat "$got")"; fi

# H10: GRAPHIFY_BIN sin GRAPHIFY_ALLOW_TEST_BIN=1 se ignora (corre el binario real, no el falso).
rm -f "$FAKECALLS"
GRAPHIFY_BIN="$FAKES/argv" scripts/graphify explain "X" >/dev/null 2>&1
lib_bin=$(GRAPHIFY_BIN="$FAKES/argv" sh -c '. "$1"; graphify_bin "$2"' sh "$CLONE/.githooks/lib-graphify.sh" "$CLONE")
if [ ! -f "$FAKECALLS" ] && [ "$lib_bin" = "$REALBIN" ]; then
  ok "GRAPHIFY_BIN sin GRAPHIFY_ALLOW_TEST_BIN=1: se ignora (no llega al binario falso; graphify_bin da el real)"
else
  ko "GRAPHIFY_BIN sin GRAPHIFY_ALLOW_TEST_BIN" "¿llegó al falso?=$([ -f "$FAKECALLS" ] && echo sí || echo no); graphify_bin=$lib_bin"
fi

# H7: TERM a mitad de ejecución: no quedan temporales ni el proceso hijo.
H7TMP="$TMPREAL/h7tmp"; mkdir -p "$H7TMP"
rm -f "$FAKES/lento.pid"
t0=$(date +%s)
TMPDIR="$H7TMP" GRAPHIFY_BIN="$FAKES/lento" GRAPHIFY_ALLOW_TEST_BIN=1 scripts/graphify query "x" >/dev/null 2>&1 &
wp=$!
i=0; while [ "$i" -lt 100 ] && [ ! -s "$FAKES/lento.pid" ]; do sleep 0.1; i=$((i + 1)); done
hijo=$(cat "$FAKES/lento.pid" 2>/dev/null)
tmps_durante=$(ls "$H7TMP" | tr '\n' ' ')
kill -TERM "$wp"
wait "$wp"; rc=$?
sleep 0.5
dt=$(( $(date +%s) - t0 ))
restos=$(ls "$H7TMP")
if [ -n "$hijo" ] && [ "$rc" = 143 ] && [ -n "$tmps_durante" ] && [ -z "$restos" ] && ! vivo "$hijo"; then
  ok "kill -TERM a scripts/graphify a mitad: rc 143 en ${dt} s, el hijo ($hijo) murió y no quedan temporales (durante: $tmps_durante)"
else
  ko "kill -TERM a mitad" "rc=$rc hijo=$hijo vivo=$(vivo "$hijo" && echo sí || echo no) restos=[$(printf '%s' "$restos" | tr '\n' ' ')]"
  [ -n "$hijo" ] && kill "$hijo" 2>/dev/null
fi

# Entorno limpio a través de scripts/graphify: nada fuera de la lista blanca llega al binario.
POLUCION="ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN AWS_ACCESS_KEY_ID OPENROUTER_API_KEY GRAPHIFY_BACKEND GRAPHIFY_API_KEY GRAPHIFY_OUT OPENAI_API_KEY ANTHROPIC_API_KEY GRAPHIFY_ALLOW_LOCAL_PROVIDERS"
envlimpio() { # archivo con nombres -> deja en ENV_EXTRA lo que sobra (solo nombres)
  ENV_EXTRA=""
  while IFS= read -r _l; do
    case "$_l" in claude=*) continue ;; esac
    case " $ALLOWED " in *" $_l "*) ;; *) ENV_EXTRA="$ENV_EXTRA $_l" ;; esac
  done < "$1"
  [ -z "$ENV_EXTRA" ]
}
polucion() { for _p in $POLUCION; do export "$_p=valor-falso"; done; }
(
  polucion
  conbin "$FAKES/env" scripts/graphify query "x" > "$FAKES/wrapper.env" 2>/dev/null
)
if envlimpio "$FAKES/wrapper.env" && grep -q '^claude=no$' "$FAKES/wrapper.env"; then
  ok "scripts/graphify: ninguna variable fuera de la lista blanca llega al binario y claude no se resuelve ($(grep -vc '^claude=' "$FAKES/wrapper.env") variables)"
else
  ko "scripts/graphify: entorno limpio" "sobran:$ENV_EXTRA; claude=$(grep '^claude=' "$FAKES/wrapper.env")"
fi
for _p in $POLUCION; do
  if grep -qx "$_p" "$FAKES/wrapper.env"; then ko "scripts/graphify: $_p no debe llegar" "llegó"; fi
done

MSG='[graphify] en este repo solo se usa scripts/graphify (solo AST)'
# rc 0: las líneas que sugieren algo se reemplazan por la frase.
out=$(conbin "$FAKES/sug0" scripts/graphify query "x" 2>"$FAKES/sug0.err"); rc=$?
err=$(cat "$FAKES/sug0.err")
if [ "$rc" = 0 ] && [ "$(printf '%s\n' "$out" | grep -cxF "$MSG")" = 4 ] && printf '%s' "$out" | grep -qxF 'resultado normal: scripts/graphify path A B' \
   && ! printf '%s' "$out" | grep -q 'cluster-only\|graphify label\|--update\|Siguiente paso'; then
  ok "filtro (rc 0): las 4 líneas que sugieren /graphify, cluster-only, label y --update se reemplazan; la normal (con scripts/graphify) queda"
else
  ko "filtro (rc 0): stdout" "rc=$rc $(flat "$out")"
fi
if [ "$(printf '%s\n' "$err" | grep -cxF "$MSG")" = 1 ] && printf '%s' "$err" | grep -qxF 'aviso normal en stderr'; then
  ok "filtro (rc 0): stderr también se filtra"
else
  ko "filtro (rc 0): stderr" "$(flat "$err")"
fi
# rc distinto de 0 (H8): la línea original se conserva y la frase va al lado; el rc se conserva.
out=$(conbin "$FAKES/rc3" scripts/graphify query "x" 2>"$FAKES/rc3.err"); rc=$?
err=$(cat "$FAKES/rc3.err")
if [ "$rc" = 3 ]; then ok "filtro: el rc 3 del graphify falso llega como 3"; else ko "filtro: rc" "rc=$rc"; fi
if [ "$(printf '%s\n' "$out" | grep -cF "  $MSG")" = 4 ] \
   && printf '%s\n' "$out" | grep -qxF "Siguiente paso: ejecuta /graphify para etiquetar  $MSG" \
   && printf '%s\n' "$out" | grep -qxF "o vuelve con --update  $MSG" \
   && printf '%s' "$out" | grep -qxF 'resultado normal: scripts/graphify path A B'; then
  ok "filtro (rc 3): las 4 líneas conservan su texto original con la frase al lado; la normal queda igual"
else
  ko "filtro (rc 3): stdout" "$(flat "$out")"
fi
if printf '%s\n' "$err" | grep -qxF "aviso en stderr: prueba /graphify aquí  $MSG" && printf '%s' "$err" | grep -qxF 'aviso normal en stderr'; then
  ok "filtro (rc 3): stderr conserva la línea original con la frase al lado"
else
  ko "filtro (rc 3): stderr" "$(flat "$err")"
fi
# H8: el error real de graphify (rc 1) que menciona /graphify no se pierde.
out=$(conbin "$FAKES/err1" scripts/graphify query "x" 2>"$FAKES/err1.err"); rc=$?
err=$(cat "$FAKES/err1.err")
if [ "$rc" = 1 ] && printf '%s\n' "$err" | grep -qxF "error: path not found: /graphify  $MSG"; then
  ok "filtro (rc 1): «error: path not found: /graphify» conserva el texto original (con la frase al lado)"
else
  ko "filtro (rc 1): error original" "rc=$rc stderr: $(flat "$err")"
fi
# H8: bytes que no son UTF-8, con un locale UTF-8: la salida no se corta.
out=$(LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 GRAPHIFY_BIN="$FAKES/bytes" GRAPHIFY_ALLOW_TEST_BIN=1 scripts/graphify query "x" 2>&1); rc=$?
want=$(printf 'antes \377\376 binario\n%s\ndespues \351 fin' "$MSG")
if [ "$rc" = 0 ] && [ "$out" = "$want" ]; then
  ok "filtro: bytes no UTF-8 (locale UTF-8) no truncan la salida: 3 líneas, la del medio reemplazada, bytes intactos"
else
  ko "filtro: bytes no UTF-8" "rc=$rc salida (od): $(printf '%s' "$out" | od -c | head -n 6 | tr '\n' ' ')"
fi
# «/graphify» como sugerencia es el comando suelto (como en el filtro de la lib); rutas como
# scripts/graphify o graphify-out/ son normales y no cuentan.
SUGERENCIA='cluster-only|graphify label|--update|(^|[^/A-Za-z0-9_-])/graphify([^A-Za-z0-9_-]|$)'
# setup-dev pasa la salida de graphify por el mismo filtro (graphify_exec_filtered) y conserva el rc.
sd=$(conbin "$FAKES/sug0" scripts/setup-dev.sh 2>&1); rc=$?
if [ "$rc" = 0 ] && [ "$(printf '%s\n' "$sd" | grep -cxF "$MSG")" -ge 10 ] \
   && ! printf '%s' "$sd" | grep -Eq "$SUGERENCIA"; then
  ok "setup-dev con un graphify falso (rc 0): la salida no contiene «cluster-only» ni «/graphify», se reemplazan por la frase"
else
  ko "setup-dev: filtro (rc 0)" "rc=$rc; $(flat "$sd")"
fi
sd=$(conbin "$FAKES/rc3" scripts/setup-dev.sh 2>&1); rc=$?
if [ "$rc" = 3 ] && [ "$(printf '%s\n' "$sd" | grep -cF "  $MSG")" -ge 5 ]; then
  ok "setup-dev con un graphify falso (rc 3): el rc 3 se conserva y las líneas llevan la frase al lado"
else
  ko "setup-dev: filtro (rc 3)" "rc=$rc; $(flat "$sd")"
fi
# H10: XDG_DATA_HOME relativa o HOME vacío: setup-dev aborta con un mensaje, sin instalar nada.
sd=$(XDG_DATA_HOME=relativa/datos scripts/setup-dev.sh 2>&1); rc=$?
if [ "$rc" = 1 ] && printf '%s' "$sd" | grep -q 'XDG_DATA_HOME no es una ruta absoluta' && [ ! -e relativa ]; then
  ok "setup-dev con XDG_DATA_HOME relativa: aborta (rc 1) con un mensaje y no crea nada"
else
  ko "setup-dev con XDG_DATA_HOME relativa" "rc=$rc; $(flat "$sd")"
fi
sd=$(HOME= XDG_DATA_HOME= scripts/setup-dev.sh 2>&1); rc=$?
if [ "$rc" = 1 ] && printf '%s' "$sd" | grep -q 'HOME está vacío'; then
  ok "setup-dev con HOME vacío (y sin XDG_DATA_HOME): aborta (rc 1) con un mensaje"
else
  ko "setup-dev con HOME vacío" "rc=$rc; $(flat "$sd")"
fi
if ! printf '%s' "$out1" | grep -Eq "$SUGERENCIA" && ! printf '%s' "$out2" | grep -Eq "$SUGERENCIA"; then
  ok "setup-dev con el graphify real (1.ª y 2.ª vez): la salida no contiene «cluster-only» ni «/graphify»"
else
  ko "setup-dev real: filtro" "$(flat "$(printf '%s\n%s' "$out1" "$out2" | grep 'cluster-only\|/graphify')")"
fi
scripts/graphify label >/dev/null 2>&1; rc1=$?
scripts/graphify cluster-only . >/dev/null 2>&1; rc2=$?
if [ "$rc1" = 2 ] && [ "$rc2" = 2 ]; then ok "scripts/graphify label y scripts/graphify cluster-only . dan rc 2"; else ko "label / cluster-only" "rc=$rc1 y $rc2"; fi

# ---- entorno limpio dentro del rebuild de un hook -------------------------------------
guard; settle; snap
rm -f "$FAKES/hook.env"
(
  polucion
  GRAPHIFY_BIN="$FAKES/hookenv"
  GRAPHIFY_ALLOW_TEST_BIN=1
  export GRAPHIFY_BIN GRAPHIFY_ALLOW_TEST_BIN
  commit_file $CODE_DIR/_t_env.py 'def t_env_fn(): return 1' "prueba: entorno del rebuild" >/dev/null 2>&1
)
expect_rebuild "hook con GRAPHIFY_BIN falso: el rebuild corre"
settle
if [ -f "$FAKES/hook.env" ] && envlimpio "$FAKES/hook.env" && grep -q '^claude=no$' "$FAKES/hook.env"; then
  ok "rebuild de un hook: entorno limpio (ninguna variable fuera de la lista blanca; claude no se resuelve)"
else
  ko "rebuild de un hook: entorno limpio" "sobran:$ENV_EXTRA; claude=$(grep '^claude=' "$FAKES/hook.env" 2>&1)"
fi

# ---- el log del rebuild de un hook sale filtrado ---------------------------------------
# Los agentes leen el log del repo: la sugerencia de graphify «run /graphify --update in your AI
# assistant» no debe llegar a él. graphify_rebuild pasa la salida por graphify_filter, stdout y
# stderr. Se verifican POR SEPARADO: cada sugerencia va entre dos líneas marcadas de su mismo
# canal, y en el log la línea de en medio debe ser la frase. Así falla tanto si una sugerencia
# llega sin filtrar como si un canal se descarta (p. ej. stderr a /dev/null) en vez de filtrarse.
guard; settle; snap
cat > "$FAKES/hooksug" <<'EOF'
#!/bin/sh
echo "Rebuilt: 3 nodes, 2 edges"
echo "t-logfiltro stdout antes"
echo "run /graphify --update in your AI assistant"
echo "t-logfiltro stdout despues"
echo "t-logfiltro stderr antes" >&2
echo "aviso en stderr: /graphify label" >&2
echo "t-logfiltro stderr despues" >&2
exit 0
EOF
chmod +x "$FAKES/hooksug"
(
  GRAPHIFY_BIN="$FAKES/hooksug"
  GRAPHIFY_ALLOW_TEST_BIN=1
  export GRAPHIFY_BIN GRAPHIFY_ALLOW_TEST_BIN
  commit_file $CODE_DIR/_t_logfiltro.py 'def t_logfiltro_fn(): return 1' "prueba: log filtrado" >/dev/null 2>&1
)
expect_rebuild "hook con un graphify falso que sugiere /graphify --update: el rebuild corre"
settle
# Las tres líneas desde «t-logfiltro <canal> antes» en el log deben ser «antes», la frase y
# «despues».
canal_filtrado() { # <stdout|stderr>
  [ "$(grep -A2 -xF "t-logfiltro $1 antes" "$CLONELOG" | tail -n 3)" = "t-logfiltro $1 antes
$MSG
t-logfiltro $1 despues" ]
}
if grep -qxF 'Rebuilt: 3 nodes, 2 edges' "$CLONELOG" && canal_filtrado stdout; then
  ok "log del rebuild de un hook filtrado (stdout): «run /graphify --update…» queda reemplazada por la frase, entre sus dos líneas normales"
else
  ko "log del rebuild de un hook filtrado (stdout)" "$(flat "$(grep -A2 -F 't-logfiltro stdout antes' "$CLONELOG" || echo 'stdout no llegó al log')")"
fi
if canal_filtrado stderr; then
  ok "log del rebuild de un hook filtrado (stderr): «/graphify label» queda reemplazada por la frase, entre sus dos líneas normales"
else
  ko "log del rebuild de un hook filtrado (stderr)" "$(flat "$(grep -A2 -F 't-logfiltro stderr antes' "$CLONELOG" || echo 'stderr no llegó al log')")"
fi
if ! grep -Eq "$SUGERENCIA" "$CLONELOG"; then
  ok "log del rebuild de un hook filtrado: ninguna sugerencia sin filtrar en el log"
else
  ko "log del rebuild de un hook filtrado (sugerencias)" "$(flat "$(grep -E "$SUGERENCIA" "$CLONELOG")")"
fi

# ---- hooks de Claude Code -------------------------------------------------------------
guard; settle
GUARD_IN='{"session_id":"abc123","hook_event_name":"PreToolUse","tool_name":"Grep","tool_input":{"pattern":"def create_access_token","path":"'"$CODE_DIR"'"},"cwd":"'"$CLONE"'"}'
gout=$(printf '%s' "$GUARD_IN" | CLAUDE_PROJECT_DIR="$CLONE" "$CLONE/.claude/hooks/graphify-guard.sh" search 2>/dev/null); rc=$?
if [ "$rc" = 0 ] && [ -n "$gout" ] && printf '%s' "$gout" | json_valido; then
  ok "graphify-guard.sh: con grafo y una entrada realista devuelve JSON válido ($(printf '%s' "$gout" | wc -c | tr -d ' ') bytes)"
else
  ko "graphify-guard.sh con grafo" "rc=$rc salida: $(flat "$gout")"
fi
git clone -q "$CLONE" "$TMPREAL/singrafo"
gout=$(printf '%s' "$GUARD_IN" | CLAUDE_PROJECT_DIR="$TMPREAL/singrafo" "$TMPREAL/singrafo/.claude/hooks/graphify-guard.sh" read 2>&1); rc=$?
if [ "$rc" = 0 ] && [ -z "$gout" ]; then ok "graphify-guard.sh: sin grafo calla (0 bytes) y sale con 0"; else ko "graphify-guard.sh sin grafo" "rc=$rc salida: $(flat "$gout")"; fi

snap
sout=$(CLAUDE_CODE_REMOTE=true GRAPHIFY_BIN="$REALBIN" GRAPHIFY_ALLOW_TEST_BIN=1 CLAUDE_PROJECT_DIR="$CLONE" "$CLONE/.claude/hooks/graphify-session-start.sh" 2>"$FAKES/ss.err" | wc -c | tr -d ' ')
serr=$(wc -c < "$FAKES/ss.err" | tr -d ' ')
if [ "$sout" = 0 ] && [ "$serr" = 0 ]; then
  ok "graphify-session-start.sh (CLAUDE_CODE_REMOTE=true, GRAPHIFY_BIN fijado): 0 bytes en stdout y en stderr"
else
  ko "graphify-session-start.sh: salida" "stdout=$sout bytes, stderr=$serr bytes"
fi
if [ "$(fins)" = "$((S_FIN + 1))" ] && [ "$(starts)" = "$((S_START + 1))" ] && [ "$(fallidos)" = "$S_FAIL" ] && grep -q 'SessionStart nube' "$CLONELOG"; then
  ok "graphify-session-start.sh: un inicio y un fin con rc=0 en el log del repo"
else
  ko "graphify-session-start.sh: log" "inicios=$(( $(starts) - S_START )) fines=$(( $(fins) - S_FIN ))"
fi

# ---- GIT_DIR exportado: la batería aborta y el repo ajeno queda intacto ----------------
guard
OTRO=$(mktemp -d "${TMPDIR:-/tmp}/graphify-gitdir.XXXXXX")
git init -q "$OTRO/repo" && echo hola > "$OTRO/repo/archivo" && git -C "$OTRO/repo" add archivo && git -C "$OTRO/repo" commit -q -m inicial
echo sin-comitear > "$OTRO/repo/otro"
st1=$(git -C "$OTRO/repo" status --porcelain); lg1=$(git -C "$OTRO/repo" log --format='%H %s')
out=$(GIT_DIR="$OTRO/repo/.git" "$SRC/scripts/test-graphify-hooks.sh" 2>&1); rc=$?
st2=$(git -C "$OTRO/repo" status --porcelain); lg2=$(git -C "$OTRO/repo" log --format='%H %s')
if [ "$rc" = 2 ] && printf '%s' "$out" | grep -q 'GIT_DIR' && [ "$st1" = "$st2" ] && [ "$lg1" = "$lg2" ] && ! printf '%s' "$out" | grep -q '^PASS'; then
  ok "GIT_DIR exportado: la batería aborta (rc 2, nombra GIT_DIR) y el repo ajeno queda intacto"
else
  ko "GIT_DIR exportado" "rc=$rc salida: $(flat "$out"); status igual=$([ "$st1" = "$st2" ] && echo sí || echo no) log igual=$([ "$lg1" = "$lg2" ] && echo sí || echo no)"
fi
rm -rf "$OTRO"; OTRO=""

# ---- resumen --------------------------------------------------------------------------
settle 120 || ko "rebuilds pendientes" "hay un rebuild sin «=== fin» tras 120 s"
if [ "$(starts)" = "$(fins)" ] && [ "$(fallidos)" = 0 ]; then
  ok "todos los rebuilds iniciados terminaron y ninguno con error ($(starts) iniciados, $(fins) terminados, $(fallidos) con error)"
else
  ko "rebuilds iniciados = terminados, 0 con error" "$(starts) iniciados, $(fins) terminados, $(fallidos) con error"
fi
echo
echo "rebuilds en el log: $(starts) iniciados, $(fins) terminados, $(fallidos) con error"
echo "== $PASS PASS, $FAIL FAIL, $SKIP SKIP"
[ "$FAIL" -eq 0 ]
