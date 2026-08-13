#!/bin/sh

APP_HOME=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P) || exit 1

if [ -n "$JAVA_HOME" ]; then
    JAVACMD="$JAVA_HOME/bin/java"
else
    JAVACMD=java
fi

if ! command -v "$JAVACMD" >/dev/null 2>&1 && [ ! -x "$JAVACMD" ]; then
    echo "Java 17 or newer is required to run Gradle." >&2
    exit 1
fi

exec "$JAVACMD" \
    -Xmx64m -Xms64m \
    -Dorg.gradle.appname=gradlew \
    -classpath "$APP_HOME/gradle/wrapper/gradle-wrapper.jar" \
    org.gradle.wrapper.GradleWrapperMain "$@"
