# The sandbox every program runs in. One image, all toolchains.
# Built automatically by the workspace server (or: docker build -t arzin-lab-sandbox:1 workspace/sandbox)
FROM debian:trixie-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      g++ gcc gdb make \
      python3 \
      nodejs \
      openjdk-21-jdk-headless \
      time procps less nano vim-tiny ca-certificates bash-completion \
 && rm -rf /var/lib/apt/lists/*

# Lecture slides: pdftotext / pdftoppm (text + page images). Separate layer so the big one above stays cached.
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*

# Tools used by the workspace: tracers + a tiny library that turns off stdout buffering,
# so prompts like "Enter n: " appear immediately when output goes through a pipe.
COPY tools/ /opt/lab/
RUN gcc -shared -fPIC -O2 -o /opt/lab/unbuffer.so /opt/lab/unbuffer.c \
 && useradd -m -u 1000 -s /bin/bash coder \
 && printf 'PS1="\\[\\e[36m\\]lab\\[\\e[0m\\]:\\[\\e[33m\\]\\w\\[\\e[0m\\]$ "\nalias ll="ls -la"\n' >> /etc/bash.bashrc

USER coder
WORKDIR /work
CMD ["sleep", "infinity"]
