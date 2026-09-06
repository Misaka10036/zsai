ARG PHP_IMAGE=php:8.2-apache
FROM ${PHP_IMAGE}

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && docker-php-ext-install pdo pdo_mysql \
    && a2enmod rewrite headers \
    && printf '\nServerName localhost\n' >> /etc/apache2/apache2.conf \
    && rm -rf /var/lib/apt/lists/*

COPY php.ini /usr/local/etc/php/conf.d/vivarly.ini
COPY apache.conf /etc/apache2/sites-available/000-default.conf

COPY --chown=www-data:www-data . /var/www/html/

WORKDIR /var/www/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
    CMD curl -sf http://127.0.0.1/views/login.php >/dev/null || exit 1
