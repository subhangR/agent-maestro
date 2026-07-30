#!/bin/bash
cd /home/ubuntu/agent-maestro/maestro-ui
export VITE_APP_MODE=browser
export MAESTRO_DEV_API_PROXY=http://127.0.0.1:4570
exec bunx vite --port 4571 --strictPort --host 127.0.0.1
