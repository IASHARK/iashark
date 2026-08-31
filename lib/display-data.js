(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkDisplayData=api;
})(typeof window!=='undefined'?window:null,function(){
  function finiteNumber(value){return typeof value==='number'&&Number.isFinite(value);}

  function hasReliableCriteria(home,away){
    return [home,away].every(function(criteria){
      return !!criteria
        && criteria.source==='api-sports-team-statistics'
        && Number(criteria.sample_size)>=3
        && finiteNumber(criteria.att)
        && finiteNumber(criteria.def)
        && finiteNumber(criteria.fr);
    });
  }

  function hasReliableEventPatterns(home,away){
    return [home,away].every(function(pattern){
      return !!pattern
        && pattern.source==='api-sports-fixture-events'
        && Number(pattern.games)>=5
        && Array.isArray(pattern.slots)
        && pattern.slots.length===6
        && Array.isArray(pattern.slots_against)
        && pattern.slots_against.length===6;
    });
  }

  function weatherForDisplay(stadium){
    if(!stadium||stadium.weather_source!=='openweathermap'||!stadium.weather_forecast_at)return null;
    return {
      description:stadium.desc||stadium.meteo||'',
      temperature:stadium.temp||'',
      wind:stadium.wind||'',
      forecastAt:stadium.weather_forecast_at,
      source:'OpenWeather'
    };
  }

  function expectedGoalsForDisplay(match){
    var home=match&&match.lambda_h!=null?match.lambda_h:match&&match.match_stats_home&&match.match_stats_home.xg;
    var away=match&&match.lambda_a!=null?match.lambda_a:match&&match.match_stats_away&&match.match_stats_away.xg;
    if(home==null||away==null||!finiteNumber(Number(home))||!finiteNumber(Number(away)))return null;
    return {home:Number(home),away:Number(away)};
  }

  function sourceLabels(match){
    var labels=['Calendrier et équipes · API-Football'];
    if(hasReliableCriteria(match&&match.crit_home,match&&match.crit_away))labels.push('Statistiques équipes · API-Football');
    if(hasReliableEventPatterns(match&&match.events_home,match&&match.events_away))labels.push('Événements historiques · API-Football');
    if(match&&Array.isArray(match.injuries)&&match.injuries.length)labels.push('Blessures et suspensions · API-Football');
    if(match&&match.market_source&&match.market_source!=='Aucune cote fiable')labels.push('Marché · '+match.market_source);
    return labels;
  }

  function hasReliableModelOutput(match){
    if(!match)return false;
    if(match.model_output_available===false)return false;
    return Number(match.data_quality_score)>0;
  }

  return {hasReliableCriteria:hasReliableCriteria,hasReliableEventPatterns:hasReliableEventPatterns,weatherForDisplay:weatherForDisplay,expectedGoalsForDisplay:expectedGoalsForDisplay,sourceLabels:sourceLabels,hasReliableModelOutput:hasReliableModelOutput};
});
