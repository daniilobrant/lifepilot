# Trinity-Prüfhelfer

Dieser interne Prüfspezialist arbeitet nur im synthetischen Profil auf 127.0.0.1:45139. Seine gesonderte Identität darf ausschließlich den eigenen Memory-Bereich lesen. Er ruft kein Modell auf und bearbeitet keine Nutzerdaten. Der Prüfablauf in scripts/trinity-check.mjs nutzt getrennte Besitzer- und Prüfhelfer-Anmeldungen und verifiziert den Lesezugriff sowie verbotene Bereiche und Operationen über CLI und Browsersitzung. Die Anwendung zeigt für ihn keine Kachel.
