# Plan de entreno

Página pública del bloque de entrenamiento y alimentación (gimnasio, natación y menú por tipo de día),
con el calendario descargable en `.ics` y versión imprimible en PDF.

**No contiene datos personales:** peso, calorías, metas y seguimiento viven solo en el Panel de Vida
local y en el vault (`01-Proyectos/panel-de-vida/entreno-nutricion/`).

```
node generar.mjs        # plan.json → docs/index.html, docs/plan-entreno.ics, docs/plan-dias.json
node --test             # pruebas
```

- Sin dependencias de npm: solo Node 18+.
- Se edita `plan.json` (y `plantilla.html` para el diseño), se regenera y se sube.
- GitHub Pages sirve la carpeta `docs/` de la rama `main`.
- `docs/plan-dias.json` es el plan día por día que lee el panel local.
