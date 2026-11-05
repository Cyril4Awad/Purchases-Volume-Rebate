using Dapper.Contrib.Extensions;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Models
{
    [Table("tbl_EMR_PPMUsers")]
    public class tbl_Users
    {
        [ExplicitKey]
        public string Usr_code { get; set; }
        public string? Usr_Name { get; set; }

    }
}
