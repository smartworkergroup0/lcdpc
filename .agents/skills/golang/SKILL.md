---
name: golang
description: >
  Reglas estrictas para el desarrollo y sintaxis en Golang. Cubre manejo de errores,
  concurrencia con goroutines/channels, preferencia por la biblioteca estándar,
  y formateo con gofmt. Usa esta skill cuando trabajes con código Go.
---
# Golang Core Programming Rules

* **Manejo de Errores:** Maneja todos los errores explícitamente. Siempre evalúa `if err != nil` y retorna el error encapsulado con contexto adicional usando `fmt.Errorf`. Nunca ignores errores usando `_` en el retorno de funciones críticas.
* **Concurrencia:** Utiliza goroutines y canales (channels) de forma segura. Siempre asegúrate de que las goroutines tengan una condición de salida clara para evitar fugas de memoria (goroutine leaks).
* **Simplicidad:** Prefiere la biblioteca estándar de Go (`net/http`, `database/sql`, `encoding/json`) antes de sugerir frameworks de terceros pesados, a menos que se solicite lo contrario.
* **Formato:** Todo el código generado debe cumplir estrictamente con el estándar de `gofmt`. 
