function selectAllReports(select = true) {

  let select_inputs = document.querySelectorAll(".report-checkbox");
  let report_box = document.querySelectorAll(".report-box");

  if (select) {

    report_box.forEach(box => box.classList.add("border-primary"));

  } else {

    report_box.forEach(box => box.classList.remove("border-primary"));

  }


  select_inputs.forEach(input => {

    input.checked = select;

  });

}

function showLoading(selector) {

  let elem = document.querySelector(selector);
  elem.classList.add("loading-state");

}

function check(id) {

  let elem = document.getElementById(id);
  elem.classList.toggle("border-primary");

}

function demoLoading() {

  const loading_stat = $("#data-loading");

  loading_stat.removeClass("d-none");

  setTimeout(() => {

    loading_stat.addClass("d-none");

  }, 1500);

}

function globalRangeUpdate(elem) {

  const formSelects = document.querySelectorAll("#all-reports .form-select");

  formSelects.forEach(formSelect => {

    formSelect.value = elem.value;

  });

}