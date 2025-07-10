docker run --rm \
  --name sub-$SUB_ID \
  --network none \                      # no Internet / lateral movement
  --cpus="1" \                          # 1 core max
  --memory="256m" \                     # RAM cap
  --pids-limit 128 \                    # limit fork bombs
  --ulimit fsize=1048576 \              # 1 MiB file output max
  --security-opt no-new-privileges \    # disallow setuid binaries
  --cap-drop ALL \                      # zero Linux capabilities
  --read-only \                         # root FS read-only
  --tmpfs /tmp:rw,size=16m \            # scratch space
  --security-opt seccomp=$PWD/seccomp.json \  # see §3
  -v "/opt/judge/$SUB_ID:/workspace:ro" \
  judge-python:3.12-slim \
  /workspace/main.py < /workspace/input.txt
