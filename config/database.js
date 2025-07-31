// config/database.js

module.exports = {
  development: {
    url: process.env.DATABASE_URL,
    dialect: 'postgres',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
  },
  production: {
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: true,
        ca: 
        `-----BEGIN CERTIFICATE-----
        MIIEUDCCArigAwIBAgIUVamhbykaW9Jy6tM2mreeaf9tMH8wDQYJKoZIhvcNAQEM
        BQAwQDE+MDwGA1UEAww1MmUyYmU4MTItZDFhYS00ZWRlLWE1NmYtOGEwNTk2Zjc0
        MTViIEdFTiAxIFByb2plY3QgQ0EwHhcNMjUwNzMxMTU1MDUyWhcNMzUwNzI5MTU1
        MDUyWjBAMT4wPAYDVQQDDDUyZTJiZTgxMi1kMWFhLTRlZGUtYTU2Zi04YTA1OTZm
        NzQxNWIgR0VOIDEgUHJvamVjdCBDQTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCC
        AYoCggGBAKksNV/zTYb8O+Ag5I9EgH4Z44loCr/8HlALKyiQnp/1mUTNkyzV7rzA
        /cVM8Dc7exyxwrVqnycLcgQ+6/aDX1HQi7akNu6hs4/wwlJayom/PVu2vHEFjyLi
        4+5mVQvKtnD6w62n4OziBlAhQUgtc7Q9VRCIyg8cTveWqM0MTkytV9GzfYDB3Kz3
        3+zf73gAFnLvE1Hh2cMHkE6MmelM+wmB9yrm3PHUrkHLvtDL1SQW9faPRXOeYxrB
        iaoEW217Sbu5amd1Czf0Akc/11xhbcoy4QiQIe/QwBbugsYAUxQYN3lia1ueVldy
        ISxr6A8w/oahs2F/PlR6+zPj6LO0NdE1qa16M9nGt1NFCvEXq9tl7xw72pxphmJX
        bXPgHZs+pcIg1Erii42mK1fK/dGS7xGxtXW+aJRIC0q7uezZ8NZWs/S7q7g2n6Gg
        4xU5mNpUyl9fkAi8VtK+GzTLuJKPhBtJnq1piQM8mZx8gJLu2Mb921//hiheYyKj
        +eDjlH1Z5QIDAQABo0IwQDAdBgNVHQ4EFgQUQhAZ1YuxVKXmYtYWzHharPsSCI0w
        EgYDVR0TAQH/BAgwBgEB/wIBADALBgNVHQ8EBAMCAQYwDQYJKoZIhvcNAQEMBQAD
        ggGBAEsxM2I0K/mWAnf7tJ2OiR3th41ZqgldloemCfN8l2ApTsHhfgM8/ML+6DkJ
        vtNECc0HC3P5AmevW2Tr4fNMHYJ/YZf/CI2PkU9p5cAPrkyDyXKfAK3yvoa/NsE5
        Na0nQXGd6cu0R2XS3UCSTpfmtKkNKrSQIZP/5eAvvpY2XUBkOyG+q1LIlf5693yw
        nBOfTBu2ILSZ+S0K/is6KUAjDwuBoNGHLvvgDp3zAafnNusbjS1OwpSyV7uejAHO
        5ukQvgjetfVJheuazE+fn2S0o/OnSqWBnSt0vcR8AaGKoEUdiHarVShWbxHrd+B8
        BA3TOPzhDZbrjMAYIEUeYLub+1CWzHICQiHeWyoQeUktkrmYHegpZS6F//gT8nUl
        hXrD/gb6Ofs8qQ2QdSAmoJHGI4wAxTbBxIi2VIUYs0MhtMn+Zl+kCKFr8fluM2iz
        ma7W1uB54pkLWPcqfeRpTrZQlKth4k3ObEWNHUURMaE5TaUQMmRpOmmQV91D4ZtL
        x/Kzog==
        -----END CERTIFICATE-----`,
      },
    },
    // Opcional: Configuración del pool de conexiones para producción
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false, // Desactivar logs de SQL en producción
  },
};