# Lokale testomgeving voor de PHP-API. Productie draait op Hostinger (LiteSpeed, PHP 8.2).
FROM php:8.2-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers

COPY apache.conf /etc/apache2/conf-available/games.conf
RUN a2enconf games
