from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import IMD_ORANGE_MM, IMD_RED_MM, IMD_YELLOW_MM


def get_risk_level(score: int) -> str:
    if score >= 80:
        return "Severe"
    if score >= 60:
        return "High"
    if score >= 30:
        return "Moderate"
    return "Low"


def calculate_zone_risk(zone: dict, weather: dict) -> dict[str, Any]:
    current_rate = max(0.0, float(weather.get("currentRateMmPerHour") or 0))
    rain24 = max(0.0, float(weather.get("last24hMm") or 0))
    rain72 = max(0.0, float(weather.get("last72hMm") or 0))

    intensity_factor = current_rate * 3.2
    effective72 = rain72 * 0.42
    slope_clamped = max(5, min(50, float(zone["slope"])))
    slope_multiplier = round((slope_clamped / 26) ** 1.65, 2)
    saturation_factor = round(1.0 + (float(zone["soilSaturationInitial"]) / 100) * 0.55, 2)
    raw_landslide = (intensity_factor + effective72) * slope_multiplier * saturation_factor * 0.45
    landslide_score = int(min(100, max(0, round(raw_landslide))))

    flood_acc = rain24 * 0.68
    flood_int = current_rate * 3.6
    river = max(0.1, float(zone["riverProximityKm"]))
    river_mult = round(max(0.6, 2.4 - river * 0.55), 2)
    elevation_factor = round(max(0.7, 2.0 - (min(float(zone["elevation"]), 1500) / 1200) * 0.85), 2)
    river_data = weather.get("riverDischarge") or {}
    current_discharge = river_data.get("currentM3s")
    high_flow_threshold = river_data.get("highFlowThresholdM3s")
    flow_ratio = (
        float(current_discharge) / float(high_flow_threshold)
        if current_discharge is not None and high_flow_threshold is not None and float(high_flow_threshold) > 0
        else None
    )
    river_flow_factor = round(1.0 + 0.5 * min(2.0, max(0.0, flow_ratio)), 2) if flow_ratio is not None else 1.0
    raw_flood = (flood_acc + flood_int) * river_mult * elevation_factor * river_flow_factor * 0.40
    flood_score = int(min(100, max(0, round(raw_flood))))

    higher, lower = max(landslide_score, flood_score), min(landslide_score, flood_score)
    composite = int(min(100, round(higher * 0.75 + lower * 0.25)))
    overall = get_risk_level(composite)

    advisories: list[str] = []
    thresholds: list[str] = []
    if current_rate >= 15:
        advisories.append(f"Torrential downpour ({current_rate:.1f} mm/h)")
        thresholds.append("Rain intensity > 15 mm/h")
    elif current_rate >= 7.5:
        advisories.append(f"Heavy rainfall ({current_rate:.1f} mm/h)")
        thresholds.append("Rain intensity > 7.5 mm/h")
    if rain24 >= IMD_RED_MM:
        advisories.append(f"IMD Red 24h threshold exceeded ({rain24:.0f} mm)")
        thresholds.append(f"24h > {IMD_RED_MM} mm")
    elif rain24 >= IMD_ORANGE_MM:
        advisories.append(f"IMD Orange 24h threshold exceeded ({rain24:.0f} mm)")
        thresholds.append(f"24h > {IMD_ORANGE_MM} mm")
    elif rain24 >= IMD_YELLOW_MM:
        advisories.append(f"IMD Yellow 24h threshold exceeded ({rain24:.0f} mm)")
        thresholds.append(f"24h > {IMD_YELLOW_MM} mm")
    if landslide_score >= 60 and zone["slope"] >= 28:
        advisories.append(f"Slope instability along {zone['slope']}° terrain")
    if flood_score >= 60 and zone["riverProximityKm"] <= 0.5:
        advisories.append(f"Riparian surge within {zone['riverProximityKm']} km of {zone.get('riverName', 'channel')}")
    if flow_ratio is not None and flow_ratio >= 1.0:
        advisories.append(f"GloFAS discharge reached {flow_ratio:.1f}x the local high-flow reference")
        thresholds.append("Daily river discharge >= local historical 95th percentile")
    if not advisories:
        advisories.append("Catchment drainage within baseline capacity")

    action = "Routine monitoring. Keep standard communications active."
    if overall == "Moderate":
        action = "Alert district control room; clear culverts; watch gauges."
    elif overall == "High":
        action = "Stage SDRF; restrict low-lying roads; prepare relief camps."
    elif overall == "Severe":
        action = "Check official evacuation instructions. Avoid marked flood corridors and unstable slopes."

    return {
        "compositeScore": composite,
        "overallLevel": overall,
        "landslideScore": landslide_score,
        "landslideLevel": get_risk_level(landslide_score),
        "landslideBreakdown": {
            "intensityFactor": round(intensity_factor, 1),
            "saturationFactor": saturation_factor,
            "slopeMultiplier": slope_multiplier,
            "effective72hMm": round(effective72, 1),
            "rawScore": round(raw_landslide, 1),
        },
        "floodScore": flood_score,
        "floodLevel": get_risk_level(flood_score),
        "floodBreakdown": {
            "accumulation24h": round(flood_acc, 1),
            "intensityFactor": round(flood_int, 1),
            "riverProximityMultiplier": river_mult,
            "elevationFunnelMultiplier": elevation_factor,
            "riverFlowMultiplier": river_flow_factor,
            "riverFlowRatio": round(flow_ratio, 2) if flow_ratio is not None else None,
            "riverDischargeM3s": round(float(current_discharge), 1) if current_discharge is not None else None,
            "riverHighFlowThresholdM3s": round(float(high_flow_threshold), 1) if high_flow_threshold is not None else None,
            "rawScore": round(raw_flood, 1),
        },
        "activeAdvisories": advisories,
        "recommendedAction": action,
        "thresholdsTriggered": thresholds,
    }


def generate_alert(zone: dict, assessment: dict, nowcast: dict | None = None) -> dict | None:
    if assessment["overallLevel"] not in ("High", "Severe"):
        return None
    if assessment["landslideScore"] >= 65 and assessment["floodScore"] < 60:
        hazard = "LANDSLIDE"
    elif assessment["floodScore"] >= 65 and assessment["landslideScore"] < 60:
        hazard = "FLASH_FLOOD"
    elif assessment["landslideScore"] >= 60 and assessment["floodScore"] >= 60:
        hazard = "MULTI_HAZARD"
    else:
        hazard = "EXTREME_RAINFALL"
    level = assessment["overallLevel"]
    lead = (nowcast or {}).get("leadTimeHours", 3)
    headline = (
        f"CRITICAL WARNING: Imminent {hazard.replace('_', ' ')} in {zone['name']}"
        if level == "Severe"
        else f"HIGH ALERT: {hazard.replace('_', ' ')} hazard in {zone['name']}"
    )
    return {
        "id": f"alert-{zone['id']}",
        "zoneId": zone["id"],
        "zoneName": zone["name"],
        "region": zone["region"],
        "level": level,
        "hazardType": hazard,
        "headline": headline,
        "recommendation": assessment["recommendedAction"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "compositeScore": assessment["compositeScore"],
        "leadTimeHours": lead,
        "imdColor": (nowcast or {}).get("imdColor", "YELLOW"),
        "acknowledged": False,
    }
