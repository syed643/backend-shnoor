# FROM node:20-bullseye

# RUN apt-get update && \
#     apt-get install -y \
#       python3 \
#       python3-pip \
#       gcc\
#       g++ \
#       openjdk-17-jdk && \
#     apt-get clean

# WORKDIR /sandbox

# CMD ["sleep", "infinity"]

FROM node:20-bullseye

RUN apt-get update && \
    apt-get install -y \
      python3 \
      python3-pip \
      gcc \
      g++ \
      openjdk-17-jdk && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 🔑 IMPORTANT
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$JAVA_HOME/bin:$PATH"

WORKDIR /sandbox

CMD ["sleep", "infinity"]
