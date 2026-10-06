#!/bin/sh
# =========================================================
#  commit-globe recorder
#  Run by the post-commit hook that `commit-globe.js install` adds to
#  each repository. Appends one tab-separated line per commit to
#  ~/.commit-globe/commits.tsv: when, where (city-level, looked up from
#  your public IP) and what (repo, sha, message, size of the change).
#  That log never leaves this machine — `commit-globe.js publish`
#  decides what ends up on the website.
# =========================================================

GLOBE_HOME="${COMMIT_GLOBE_HOME:-$HOME/.commit-globe}"
LOG="$GLOBE_HOME/commits.tsv"
CACHE="$GLOBE_HOME/location.cache"
PIN="$GLOBE_HOME/pinned.tsv"
REGISTRY="$GLOBE_HOME/repos.txt"
CACHE_TTL=1200   # seconds a looked-up location is reused (20 min)

[ "$COMMIT_GLOBE_DISABLE" = 1 ] && exit 0

# read the commit now — HEAD may move on once the hook returns
{ read -r git_dir; read -r sha; } <<EOF
$(git rev-parse --git-dir HEAD 2>/dev/null)
EOF
[ -n "$sha" ] || exit 0

# commits replayed by a rebase were already recorded when first made
if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then exit 0; fi

# tidy a value for the TSV log: no tabs or line breaks
clean() { printf '%s' "$1" | tr '\t\r\n' '   '; }

# pull "key": "text" / "key": 12.3 out of a flat JSON response
json_str() { printf '%s' "$2" | sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p"; }
json_num() { printf '%s' "$2" | sed -n "s/.*\"$1\" *: *\(-\{0,1\}[0-9][0-9.]*\).*/\1/p"; }

is_coord() { case $1 in '' | *[!0-9.-]*) return 1 ;; esac; }

# prints: city, region, country, lat, lon, time zone, how-it-was-found (tab-separated)
locate() {
  # 1. a pinned location (`commit-globe.js pin`) always wins — handy behind a VPN
  if [ -s "$PIN" ]; then printf '%s\tpinned\n' "$(head -n 1 "$PIN")"; return; fi

  # 2. a recent lookup, so a burst of commits doesn't hammer the API
  now=$(date +%s)
  if [ -s "$CACHE" ]; then
    cached_at=$(head -n 1 "$CACHE")
    case $cached_at in
      '' | *[!0-9]*) ;;
      *) if [ $((now - cached_at)) -lt "$CACHE_TTL" ]; then
           printf '%s\tcache\n' "$(sed -n 2p "$CACHE")"; return
         fi ;;
    esac
  fi

  # 3. IP geolocation: ipinfo.io, falling back to ipwho.is
  json=$(curl -fsS --max-time 8 https://ipinfo.io/json 2>/dev/null | tr -d '\r\n')
  loc=$(json_str loc "$json")
  lat=${loc%,*}; lon=${loc#*,}
  city=$(json_str city "$json"); region=$(json_str region "$json")
  country=$(json_str country "$json"); tz=$(json_str timezone "$json"); found_by=ipinfo
  if ! is_coord "$lat" || ! is_coord "$lon"; then
    json=$(curl -fsS --max-time 8 https://ipwho.is/ 2>/dev/null | tr -d '\r\n')
    lat=$(json_num latitude "$json"); lon=$(json_num longitude "$json")
    city=$(json_str city "$json"); region=$(json_str region "$json")
    country=$(json_str country_code "$json"); tz=$(json_str id "$json"); found_by=ipwho
  fi
  if is_coord "$lat" && is_coord "$lon"; then
    found=$(printf '%s\t%s\t%s\t%s\t%s\t%s' "$(clean "$city")" "$(clean "$region")" "$(clean "$country")" "$lat" "$lon" "$(clean "$tz")")
    printf '%s\n%s\n' "$now" "$found" > "$CACHE"
    printf '%s\t%s\n' "$found" "$found_by"; return
  fi

  # 4. offline: reuse the last known location, however old
  if [ -s "$CACHE" ]; then printf '%s\tstale-cache\n' "$(sed -n 2p "$CACHE")"; return; fi
  printf '\t\t\t\t\t\tunknown\n'
}

# everything else (including the network lookup) runs in the background,
# so `git commit` returns immediately
(
  TAB=$(printf '\t')
  meta=$(git log -1 --format='%cI%x09%s' "$sha")
  when=${meta%%"$TAB"*}
  subject=${meta#*"$TAB"}
  top=$(git rev-parse --show-toplevel)
  repo=${top##*/}
  remote=$(git remote get-url origin 2>/dev/null || git remote get-url "$(git remote | head -n 1)" 2>/dev/null)
  remote=$(printf '%s' "$remote" | sed 's#://[^/@]*@#://#')   # never log embedded credentials
  stat=$(git diff-tree --no-commit-id --shortstat --root -r "$sha")
  files=$(printf '%s' "$stat" | sed -n 's/^ *\([0-9][0-9]*\) file.*/\1/p')
  adds=$(printf '%s' "$stat" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) insertion.*/\1/p')
  dels=$(printf '%s' "$stat" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) deletion.*/\1/p')
  mkdir -p "$GLOBE_HOME"
  where=$(locate)

  if [ ! -f "$LOG" ]; then
    printf 'committed_at\tsha\trepo\tremote\tsubject\tfiles\tinsertions\tdeletions\tcity\tregion\tcountry\tlat\tlon\ttimezone\tlocated_by\n' > "$LOG"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$when" "$sha" "$(clean "$repo")" "$(clean "$remote")" "$(clean "$subject")" \
    "${files:-0}" "${adds:-0}" "${dels:-0}" "$where" >> "$LOG"

  # remember this repo so `commit-globe.js uninstall` can find its hook later
  hooks_dir="$(git rev-parse --path-format=absolute --git-common-dir)/hooks"
  grep -qxF "$hooks_dir" "$REGISTRY" 2>/dev/null || printf '%s\n' "$hooks_dir" >> "$REGISTRY"
) </dev/null >/dev/null 2>&1 &
