FROM node:20-bullseye

RUN apt-get update && \
    apt-get install -y \
      python3 \
      python3-pip \
      g++ \
      openjdk-17-jdk && \
    apt-get clean

WORKDIR /sandbox

CMD ["sleep", "infinity"]