import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import axios from "axios";
import { ProgressBar } from "react-native-paper";
import { MaterialIcons } from "@expo/vector-icons";

const PROMETHEUS_URL = "http://10.0.0.25:9090/api/v1/query";

export default function SystemUsage() {
  const [selectedVM, setSelectedVM] = useState("10.0.0.27");
  const [cpuUsage, setCpuUsage] = useState(null);
  const [ramUsage, setRamUsage] = useState(null);
  const [storageUsage, setStorageUsage] = useState(null);
  const [networkUsage, setNetworkUsage] = useState(null);
  const [isVMOnline, setIsVMOnline] = useState(true);
  const [dnsStatus, setDnsStatus] = useState(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [selectedVM]);

  const fetchMetrics = async () => {
    try {
      console.log(`📡 Récupération des métriques pour la VM ${selectedVM}...`);

      // Vérification si la VM est UP
      const upQuery = `up{instance="${selectedVM}:9182"}`;
      const upResponse = await axios.get(PROMETHEUS_URL, {
        params: { query: upQuery },
      });

      const isOnline = upResponse.data.data.result.length > 0 &&
        parseFloat(upResponse.data.data.result[0].value[1]) === 1;

      setIsVMOnline(isOnline);

      if (!isOnline) {
        console.log(`🚫 VM ${selectedVM} OFFLINE`);
        setCpuUsage(null);
        setRamUsage(null);
        setStorageUsage(null);
        setNetworkUsage(null);
        setDnsStatus(null);
        return;
      }

      const queries = {
        cpu: `100 - (avg by(instance) (rate(windows_cpu_time_total{mode="idle", instance="${selectedVM}:9182"}[5m]))) * 100`,
        ram: `100 * (1 - (windows_memory_available_bytes{instance="${selectedVM}:9182"} / windows_cs_physical_memory_bytes{instance="${selectedVM}:9182"}))`,
        storage: `100 * (1 - (windows_logical_disk_free_bytes{instance="${selectedVM}:9182", volume="C:"} / windows_logical_disk_size_bytes{instance="${selectedVM}:9182", volume="C:"}))`,
        network: `rate(windows_net_bytes_received_total{instance="${selectedVM}:9182"}[5m]) + rate(windows_net_bytes_sent_total{instance="${selectedVM}:9182"}[5m])`,
        dns: `windows_service_state{instance="${selectedVM}:9182", name="DNS", state="running"}`
      };

      const fetchMetric = async (query) => {
        const response = await axios.get(PROMETHEUS_URL, {
          params: { query },
          paramsSerializer: (params) =>
            Object.keys(params)
              .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
              .join("&"),
        });

        return response.data.data.result.length > 0
          ? parseFloat(response.data.data.result[0].value[1])
          : null;
      };

      const [cpu, ram, storage, network, dns] = await Promise.all([
        fetchMetric(queries.cpu),
        fetchMetric(queries.ram),
        fetchMetric(queries.storage),
        fetchMetric(queries.network),
        fetchMetric(queries.dns),
      ]);

      setCpuUsage(cpu);
      setRamUsage(ram);
      setStorageUsage(storage);
      setNetworkUsage(network ? network / 1048576 : 0.0001);
      setDnsStatus(dns === 1 ? "Actif" : "Inactif");
    } catch (error) {
      console.error("❌ Erreur Prometheus API:", error.message);
      setIsVMOnline(false);
      setCpuUsage(null);
      setRamUsage(null);
      setStorageUsage(null);
      setNetworkUsage(null);
      setDnsStatus(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📊 Surveillance du Système</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.button, selectedVM === "10.0.0.27" && styles.buttonActive]} onPress={() => setSelectedVM("10.0.0.27")}>
          <Text style={styles.buttonText}>SRVWADDS02</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, selectedVM === "10.0.0.48" && styles.buttonActive]} onPress={() => setSelectedVM("10.0.0.48")}>
          <Text style={styles.buttonText}>SRVWADDS03</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, selectedVM === "10.0.0.55" && styles.buttonActive]} onPress={() => setSelectedVM("10.0.0.55")}>
          <Text style={styles.buttonText}>SRVWADDS01</Text>
        </TouchableOpacity>
      </View>

      {!isVMOnline && (
        <Text style={styles.offlineText}>🚫 La VM est hors ligne</Text>
      )}

      {[
        { label: "CPU", value: cpuUsage, color: "#ff3e3e", icon: "memory" },
        { label: "RAM", value: ramUsage, color: "#3e85ff", icon: "storage" },
        { label: "Stockage", value: storageUsage, color: "#ff9800", icon: "sd-storage" },
        { label: "Réseau", value: networkUsage, color: "#00e5ff", icon: "wifi", unit: "Mo/s", decimals: 4 },
        { label: "DNS", value: dnsStatus, color: "#4caf50", icon: "dns", unit: "", decimals: 0 },
      ].map(({ label, value, color, icon, unit = "%", decimals = 2 }, index) => (
        <View key={index} style={styles.metricContainer}>
          <View style={styles.iconContainer}>
            <MaterialIcons name={icon} size={30} color={color} />
            <Text style={styles.metricTitle}>{label}</Text>
          </View>
          {value !== null ? (
            <>
              <Text style={styles.percentage}>
                {typeof value === "number" ? value.toFixed(decimals) : value} {unit}
              </Text>
              {label !== "DNS" && <ProgressBar progress={Math.min(value / 100, 1)} color={color} style={styles.progressBar} />}
            </>
          ) : (
            <Text style={styles.loading}>Aucune donnée disponible</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: "2%", // Réduction du padding global
    backgroundColor: "#1e1e1e",
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: Dimensions.get('window').width * 0.05, // Réduction de la taille de la police
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 15 // Réduction de la marge inférieure
  },
  metricContainer: {
    width: "85%", // Réduction de la largeur
    marginBottom: 15, // Réduction de la marge inférieure
    padding: "3%", // Réduction du padding
    borderRadius: 10,
    backgroundColor: "#292929",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5
  },
  iconContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6 // Réduction de la marge inférieure
  },
  metricTitle: {
    fontSize: Dimensions.get('window').width * 0.045, // Réduction de la taille de la police
    fontWeight: "bold",
    color: "#ffffff",
    marginLeft: 8 // Réduction de la marge gauche
  },
  percentage: {
    fontSize: Dimensions.get('window').width * 0.05, // Réduction de la taille de la police
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 6 // Réduction de la marge inférieure
  },
  progressBar: {
    width: "100%",
    height: 10, // Réduction de la hauteur
    borderRadius: 5,
    backgroundColor: "#404040"
  },
  loading: {
    fontSize: Dimensions.get('window').width * 0.035, // Réduction de la taille de la police
    color: "gray"
  },
  buttonContainer: {
    width: "85%", // Réduction de la largeur
    flexDirection: "column",
    marginBottom: 15 // Réduction de la marge inférieure
  },
  button: {
    backgroundColor: "#333",
    paddingVertical: 10, // Réduction du padding vertical
    paddingHorizontal: 15, // Réduction du padding horizontal
    borderRadius: 8,
    marginVertical: 4, // Réduction de la marge verticale
    alignItems: "center"
  },
  buttonActive: {
    backgroundColor: "#007bff"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: Dimensions.get('window').width * 0.035 // Réduction de la taille de la police
  },
  offlineText: {
    fontSize: Dimensions.get('window').width * 0.035, // Réduction de la taille de la police
    color: "#ff3e3e",
    marginBottom: 8 // Réduction de la marge inférieure
  }
});







